import type { ActivityEventDTO, DamageDTO, MediaDTO, RentalChargeDTO } from "@agrorende/contracts/dto";
import type { RentalDirection } from "@agrorende/contracts/enums";
import { collections, getDb, type ActivityEvent, type Damage, type Inspection, type Rental } from "@agrorende/db";
import { z } from "zod";

import type { Ctx } from "../../context";
import { reject } from "../../errors";
import { renderRentalCheckin } from "../../pdf/rentalCheckin";
import { renderRentalCheckout } from "../../pdf/rentalCheckout";
import type { PdfLocale, RentalPdfData } from "./pdf";
import { getSummary } from "../assets/service";
import { clampLimit, escapeRegex, pageOf, parseCursor, parseInput, readDb, toDto, type Page } from "../assets/kit";
import { toMediaDto } from "../media/dto";
import {
  DamageListFilterSchema,
  EligibilityQuerySchema,
  RentalListFilterSchema,
  type ChargesView,
  type DamageListFilter,
  type EligibilityQuery,
  type EligibilityResult,
  type InspectionCompare,
  type InspectionWithMedia,
  type RentalDetail,
  type RentalListFilter,
  type RentalListItem,
} from "./dto";
import { evaluateEligibility, isHeld, isOffice, loadSettings, readTx, toChargeDto, toDamageDto, toInspectionDto, toRentalDto } from "./internal";
import { isOverdue, overdueFilter } from "./overdue";

type ReadCtx = Pick<Ctx, "orgId" | "role">;
type Db = Awaited<ReturnType<typeof readDb>>;

async function findRental(db: Db, rentalId: string): Promise<Rental> {
  const doc = await db.rentals.findOne({ _id: rentalId, deletedAt: null });
  if (doc === null) return reject("NOT_FOUND", { entityType: "RENTAL", entityId: rentalId });
  return doc;
}

async function settingsOf(ctx: Pick<Ctx, "orgId">) {
  return loadSettings(await readTx(ctx));
}

export async function listRentals(ctx: ReadCtx, raw: Partial<RentalListFilter> = {}): Promise<Page<RentalListItem>> {
  const f = parseInput(RentalListFilterSchema, raw);
  const db = await readDb(ctx);
  const { graceHours } = await settingsOf(ctx);
  const now = new Date();
  const and: Record<string, unknown>[] = [{ deletedAt: null }];
  if (f.status === "OVERDUE") and.push(overdueFilter(now, graceHours));
  else if (f.status !== undefined) and.push({ status: f.status });
  if (f.customerId !== undefined) and.push({ customerId: f.customerId });
  if (f.assetId !== undefined) and.push({ assetId: f.assetId });
  if (f.from !== undefined) and.push({ plannedEnd: { $gte: new Date(f.from) } });
  if (f.to !== undefined) and.push({ plannedStart: { $lte: new Date(f.to) } });
  if (f.q !== undefined && f.q.length > 0) {
    const pattern = new RegExp(escapeRegex(f.q), "iu");
    const [assets, customers] = await Promise.all([
      db.assets.find({ $or: [{ code: pattern }, { name: pattern }] }, { projection: { _id: 1 } }).limit(200).toArray(),
      db.customers.find({ name: pattern }, { projection: { _id: 1 } }).limit(200).toArray(),
    ]);
    and.push({
      $or: [{ number: pattern }, { assetId: { $in: assets.map((a) => a._id) } }, { customerId: { $in: customers.map((c) => c._id) } }],
    });
  }
  const offset = parseCursor(f.cursor);
  const limit = clampLimit(f.limit);
  const docs: Rental[] = await db.rentals.find({ $and: and }).sort({ plannedStart: -1, _id: 1 }).skip(offset).limit(limit + 1).toArray();
  const assetIds = [...new Set(docs.map((d) => d.assetId))];
  const customerIds = [...new Set(docs.map((d) => d.customerId))];
  const [assets, customers] = await Promise.all([
    db.assets.find({ _id: { $in: assetIds } }, { projection: { _id: 1, code: 1, name: 1 } }).toArray(),
    db.customers.find({ _id: { $in: customerIds } }, { projection: { _id: 1, name: 1, taxId: 1, taxIdType: 1 } }).toArray(),
  ]);
  const assetById = new Map(assets.map((a) => [a._id, a]));
  const customerById = new Map(customers.map((c) => [c._id, c]));
  const office = isOffice(ctx);
  const items: RentalListItem[] = docs.map((doc) => {
    const asset = assetById.get(doc.assetId);
    const customer = customerById.get(doc.customerId) ?? null;
    return {
      ...toRentalDto(doc, customer, office),
      assetCode: asset?.code ?? null,
      assetName: asset?.name ?? null,
      customerName: customer?.name ?? null,
      isOverdue: isOverdue(doc, now, graceHours),
    };
  });
  return pageOf(items, offset, limit);
}

async function chargesView(db: Db, rental: Rental): Promise<ChargesView> {
  const [lines, damages] = await Promise.all([
    db.rental_charges.find({ rentalId: rental._id, deletedAt: null }).sort({ isAuto: -1, createdAt: 1, _id: 1 }).toArray(),
    db.damages.find({ detectedRentalId: rental._id, deletedAt: null }, { projection: { _id: 1, disputeStatus: 1, matchStatus: 1 } }).toArray(),
  ]);
  const totalCents = rental.chargesTotalCents ?? lines.reduce((sum, line) => sum + line.amountCents, 0);
  return {
    rentalId: rental._id,
    status: rental.status,
    chargesVersion: rental.chargesVersion,
    totalCents,
    depositCents: rental.depositCents,
    balanceDueCents: rental.balanceDueCents ?? totalCents - rental.depositCents,
    lines: lines.map(toChargeDto),
    heldDamageIds: damages.filter(isHeld).map((d) => d._id),
  };
}

function activityDto(row: ActivityEvent): ActivityEventDTO {
  return toDto<ActivityEventDTO>(row as unknown as { _id: string; syncVersion: number } & Record<string, unknown>);
}

export async function getRentalDetail(ctx: ReadCtx, rentalId: string): Promise<RentalDetail> {
  const db = await readDb(ctx);
  const rental = await findRental(db, rentalId);
  const tx = await readTx(ctx);
  const [asset, customer, charges, damages, checkOut, checkIn, activity, settings] = await Promise.all([
    getSummary(tx, rental.assetId),
    db.customers.findOne({ _id: rental.customerId }, { projection: { _id: 1, name: 1, taxId: 1, taxIdType: 1 } }),
    chargesView(db, rental),
    db.damages
      .find({ $or: [{ detectedRentalId: rental._id }, { assetId: rental.assetId, isPreExisting: true, repairedAt: null }], deletedAt: null })
      .sort({ createdAt: 1, _id: 1 })
      .toArray(),
    rental.checkOutInspectionId == null ? null : db.inspections.findOne({ _id: rental.checkOutInspectionId }),
    rental.checkInInspectionId == null ? null : db.inspections.findOne({ _id: rental.checkInInspectionId }),
    db.activity_events.find({ entityType: "RENTAL", entityId: rental._id }).sort({ occurredAt: 1, _id: 1 }).limit(200).toArray(),
    loadSettings(tx),
  ]);
  return {
    ...toRentalDto(rental, customer, isOffice(ctx)),
    asset,
    isOverdue: isOverdue(rental, new Date(), settings.graceHours),
    charges,
    damages: damages.map(toDamageDto),
    checkOut: checkOut === null ? null : toInspectionDto(checkOut),
    checkIn: checkIn === null ? null : toInspectionDto(checkIn),
    activity: activity.map(activityDto),
  };
}

/** `GET /rentals/eligibility`: the office pre-check before reserving (EC-RN-01..05). */
export async function checkEligibility(ctx: Pick<Ctx, "orgId">, raw: EligibilityQuery): Promise<EligibilityResult> {
  const q = parseInput(EligibilityQuerySchema, raw);
  const result = await evaluateEligibility(await readTx(ctx), {
    direction: q.direction,
    assetId: q.assetId,
    customerId: q.customerId ?? null,
    siteId: q.siteId ?? null,
    from: new Date(q.from),
    to: new Date(q.to),
    excludeRentalId: q.excludeRentalId ?? null,
  });
  return { eligible: result.eligible, codes: result.codes, warnings: result.warnings };
}

export async function listCharges(ctx: Pick<Ctx, "orgId">, rentalId: string): Promise<RentalChargeDTO[]> {
  const db = await readDb(ctx);
  const rental = await findRental(db, rentalId);
  return [...(await chargesView(db, rental)).lines];
}

export async function getChargesView(ctx: Pick<Ctx, "orgId">, rentalId: string): Promise<ChargesView> {
  const db = await readDb(ctx);
  return chargesView(db, await findRental(db, rentalId));
}

const CalendarQuerySchema = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  assetId: z.string().uuid().optional(),
});
export type CalendarQuery = z.input<typeof CalendarQuerySchema>;

export interface CalendarItem {
  readonly rentalId: string;
  readonly number: string;
  readonly assetId: string;
  readonly assetCode: string | null;
  readonly direction: RentalDirection;
  readonly customerName: string | null;
  readonly status: Rental["status"];
  readonly start: string;
  readonly end: string;
  readonly isOverdue: boolean;
}

export async function rentalCalendar(ctx: Pick<Ctx, "orgId">, raw: CalendarQuery): Promise<{ items: CalendarItem[] }> {
  const q = parseInput(CalendarQuerySchema, raw);
  const db = await readDb(ctx);
  const { graceHours } = await settingsOf(ctx);
  const from = new Date(q.from);
  const to = new Date(q.to);
  const filter: Record<string, unknown> = {
    deletedAt: null,
    status: { $in: ["RESERVED", "ACTIVE", "RETURNED", "CLOSED"] },
    $or: [{ plannedStart: { $lt: to }, plannedEnd: { $gt: from } }, { status: "ACTIVE", plannedEnd: { $lte: from } }],
  };
  if (q.assetId !== undefined) filter.assetId = q.assetId;
  const docs = await db.rentals.find(filter).sort({ plannedStart: 1, _id: 1 }).limit(1000).toArray();
  const [assets, customers] = await Promise.all([
    db.assets.find({ _id: { $in: [...new Set(docs.map((d) => d.assetId))] } }, { projection: { _id: 1, code: 1 } }).toArray(),
    db.customers.find({ _id: { $in: [...new Set(docs.map((d) => d.customerId))] } }, { projection: { _id: 1, name: 1 } }).toArray(),
  ]);
  const codes = new Map(assets.map((a) => [a._id, a.code]));
  const names = new Map(customers.map((c) => [c._id, c.name]));
  const now = new Date();
  return {
    items: docs.map((doc) => ({
      rentalId: doc._id,
      number: doc.number,
      assetId: doc.assetId,
      assetCode: codes.get(doc.assetId) ?? null,
      direction: doc.direction,
      customerName: names.get(doc.customerId) ?? null,
      status: doc.status,
      start: (doc.actualStart ?? doc.plannedStart).toISOString(),
      end: (doc.actualEnd ?? doc.plannedEnd).toISOString(),
      isOverdue: isOverdue(doc, now, graceHours),
    })),
  };
}

async function mediaFor(db: Db, inspection: Inspection, damageIds: readonly string[]): Promise<MediaDTO[]> {
  const ids = [inspection.customerSignatureMediaId, inspection.agentSignatureMediaId].filter((id): id is string => typeof id === "string");
  const or: Record<string, unknown>[] = [{ "parent.type": "INSPECTION", "parent.id": inspection._id }];
  if (ids.length > 0) or.push({ _id: { $in: ids } });
  if (damageIds.length > 0) or.push({ damageId: { $in: [...damageIds] } });
  const docs = await db.media.find({ $or: or, deletedAt: null }).sort({ capturedAt: 1, _id: 1 }).toArray();
  return docs.map((doc) => toMediaDto(doc));
}

async function withMedia(db: Db, inspection: Inspection): Promise<InspectionWithMedia> {
  const damages = await db.damages.find({ detectedInspectionId: inspection._id, deletedAt: null }, { projection: { _id: 1 } }).toArray();
  return { ...toInspectionDto(inspection), media: await mediaFor(db, inspection, damages.map((d) => d._id)) };
}

async function findInspection(db: Db, inspectionId: string): Promise<Inspection> {
  const doc = await db.inspections.findOne({ _id: inspectionId, deletedAt: null });
  if (doc === null) return reject("NOT_FOUND", { entityType: "INSPECTION", entityId: inspectionId });
  return doc;
}

export async function getInspection(ctx: Pick<Ctx, "orgId">, inspectionId: string): Promise<InspectionWithMedia> {
  const db = await readDb(ctx);
  return withMedia(db, await findInspection(db, inspectionId));
}

/** Side-by-side check-out vs check-in of the inspection's rental (RN-07). */
export async function compareInspection(ctx: Pick<Ctx, "orgId">, inspectionId: string): Promise<InspectionCompare> {
  const db = await readDb(ctx);
  const inspection = await findInspection(db, inspectionId);
  const rental = await findRental(db, inspection.rentalId);
  const [checkOut, checkIn] = await Promise.all([
    rental.checkOutInspectionId == null ? null : db.inspections.findOne({ _id: rental.checkOutInspectionId }),
    rental.checkInInspectionId == null ? null : db.inspections.findOne({ _id: rental.checkInInspectionId }),
  ]);
  const inspectionIds = [checkOut?._id, checkIn?._id].filter((id): id is string => id !== undefined);
  const damages = await db.damages
    .find({ $or: [{ detectedRentalId: rental._id }, { detectedInspectionId: { $in: inspectionIds } }], deletedAt: null })
    .sort({ createdAt: 1, _id: 1 })
    .toArray();
  return {
    rentalId: rental._id,
    checkOut: checkOut === null ? null : await withMedia(db, checkOut),
    checkIn: checkIn === null ? null : await withMedia(db, checkIn),
    damages: damages.map(toDamageDto),
  };
}

export async function listDamages(
  ctx: Pick<Ctx, "orgId">,
  raw: Partial<DamageListFilter> & { cursor?: string; limit?: number } = {},
): Promise<Page<DamageDTO>> {
  const { cursor, limit: rawLimit, ...rest } = raw;
  const f = parseInput(DamageListFilterSchema, rest);
  const db = await readDb(ctx);
  const filter: Record<string, unknown> = { deletedAt: null };
  if (f.assetId !== undefined) filter.assetId = f.assetId;
  if (f.rentalId !== undefined) filter.detectedRentalId = f.rentalId;
  if (f.open === "true") filter.repairedAt = null;
  if (f.open === "false") filter.repairedAt = { $ne: null };
  const offset = parseCursor(cursor);
  const limit = clampLimit(rawLimit);
  const docs: Damage[] = await db.damages.find(filter).sort({ createdAt: -1, _id: 1 }).skip(offset).limit(limit + 1).toArray();
  return pageOf(docs.map(toDamageDto), offset, limit);
}

// ───────── PDF (RN-05) ─────────

function textOf(label: unknown, locale: string): string {
  if (typeof label === "string") return label;
  const map = (label ?? {}) as Record<string, string>;
  return map[locale] ?? map["pt-BR"] ?? map.en ?? "";
}

export async function renderRentalPdf(
  ctx: Pick<Ctx, "orgId">,
  rentalId: string,
  kind: "checkout" | "checkin",
): Promise<{ bytes: Uint8Array; filename: string }> {
  const db = await readDb(ctx);
  const rental = await findRental(db, rentalId);
  const inspectionId = kind === "checkout" ? rental.checkOutInspectionId : rental.checkInInspectionId;
  if (inspectionId === null || inspectionId === undefined) return reject("NOT_FOUND", { entityType: "INSPECTION", rentalId, kind });
  const inspection = await findInspection(db, inspectionId);
  const [org, asset, customer, performer, template] = await Promise.all([
    collections.organizations(await getDb()).findOne({ _id: ctx.orgId }, { projection: { name: 1, timezone: 1 } }),
    db.assets.findOne({ _id: rental.assetId }, { projection: { code: 1, name: 1 } }),
    db.customers.findOne({ _id: rental.customerId }, { projection: { name: 1, taxId: 1 } }),
    db.users.findOne({ _id: inspection.performedById }, { projection: { name: 1 } }),
    inspection.templateId == null ? null : db.checklist_templates.findOne({ _id: inspection.templateId }, { projection: { accessories: 1 } }),
  ]);
  const damages =
    kind === "checkout"
      ? await db.damages
          .find({
            assetId: rental.assetId,
            deletedAt: null,
            $or: [{ detectedInspectionId: inspection._id }, { repairedAt: null, createdAt: { $lte: inspection.performedAt } }],
          })
          .toArray()
      : await db.damages.find({ detectedRentalId: rental._id, detectedInspectionId: inspection._id, deletedAt: null }).toArray();
  const locale: PdfLocale = rental.documentLocale === "en" ? "en" : "pt-BR";
  const accessoryLabel = new Map((template?.accessories ?? []).map((def) => [def.accessoryKey, textOf(def.label, locale)]));
  const items = new Map(inspection.templateSnapshot.map((item) => [item.key, textOf(item.label, locale)]));
  const charges = kind === "checkin" ? await chargesView(db, rental) : null;
  const data: RentalPdfData = {
    locale,
    timeZone: org?.timezone ?? "America/Sao_Paulo",
    orgName: org?.name ?? "AgroRende",
    rental: {
      number: rental.number,
      direction: rental.direction,
      plannedStart: rental.plannedStart,
      plannedEnd: rental.plannedEnd,
      actualStart: rental.actualStart ?? null,
      actualEnd: rental.actualEnd ?? null,
      rateCents: rental.rateCents,
      rateUnit: rental.rateUnit,
      depositCents: rental.depositCents,
      fuelPolicy: rental.fuelPolicy,
    },
    customer: { name: customer?.name ?? "—", taxId: customer?.taxId ?? null },
    asset: { code: asset?.code ?? "—", name: asset?.name ?? "—" },
    inspection: {
      performedAt: inspection.performedAt,
      performedBy: performer?.name ?? null,
      hourMeter: inspection.hourMeter ?? null,
      odometerKm: inspection.odometerKm ?? null,
      fuelPercent: inspection.fuelPercent ?? null,
      checklist: inspection.responses.map((r) => ({
        label: items.get(r.key) ?? r.key,
        value: r.value === null ? "—" : `${String(r.value)}${r.note === undefined ? "" : ` (${r.note})`}`,
      })),
      accessories: inspection.accessories.map((a) => ({ label: accessoryLabel.get(a.accessoryKey) ?? a.accessoryKey, expected: a.expected, present: a.present })),
      operatorName: inspection.operatorName ?? null,
      safetyBriefingGiven: inspection.safetyBriefingGiven,
      termsAccepted: inspection.termsAccepted,
      termsVersion: inspection.termsVersion ?? null,
      signerName: inspection.signerName ?? null,
      signatureStatus: inspection.signatureStatus,
      signatureReason: inspection.signatureReason ?? null,
      notes: inspection.notes ?? null,
    },
    damages: damages.map((d) => ({
      zone: d.zone,
      severity: d.severity,
      description: d.description ?? null,
      isPreExisting: d.isPreExisting,
      estimatedCostCents: d.estimatedCostCents ?? null,
      disputeStatus: d.disputeStatus,
      matchStatus: d.matchStatus,
    })),
    ...(charges === null
      ? {}
      : {
          charges: {
            lines: charges.lines.map((line) => ({ description: line.description, amountCents: line.amountCents })),
            totalCents: charges.totalCents,
            depositCents: charges.depositCents,
            balanceDueCents: charges.balanceDueCents,
          },
        }),
  };
  const bytes = kind === "checkout" ? await renderRentalCheckout(data) : await renderRentalCheckin(data);
  return { bytes, filename: `${rental.number}-${kind}.pdf` };
}
