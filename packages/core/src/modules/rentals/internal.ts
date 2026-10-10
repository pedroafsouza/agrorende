import { AppError } from "@agrorende/contracts/errors";
import { maskTaxId, taxIdKind } from "@agrorende/contracts";
import { checkRentalEligibility, summarizeRentalCharges, type ChargeLine, type ChargesInput, type ManualChargeLine } from "@agrorende/contracts/charges";
import type { DamageDTO, InspectionDTO, RentalChargeDTO, RentalDTO } from "@agrorende/contracts/dto";
import type { RentalDirection } from "@agrorende/contracts/enums";
import { rentalMachine } from "@agrorende/contracts/machines";
import type { AssetSummary, Tx } from "@agrorende/contracts/seams";
import { collections, getDb, type Customer, type Damage, type Inspection, type Rental, type RentalCharge, type SyncTx as DbSyncTx } from "@agrorende/db";

import type { Ctx } from "../../context";
import { reject } from "../../errors";
import { emit } from "../../events/index";
import type { SyncTx } from "../../sync/types";
import { dbTx, newId, readDb, stampCreate, stampUpdate, toDto } from "../assets/kit";
import { getSummary } from "../assets/service";
import type { EligibilityResult, RentalWarningCode } from "./dto";

export const HOUR_MS = 3_600_000;
export const DISPUTE_WINDOW_HOURS = 48;
/** Planned start may be this far in the past when a rental is created or edited (EC-RN-04). */
export const START_PAST_TOLERANCE_MS = HOUR_MS;
export const OFFICE_ROLES = ["ADMIN", "MANAGER"] as const;
export const OPEN_REPORT_STATUSES = ["SUBMITTED", "IN_REVIEW"] as const;

export interface RentalSettings {
  readonly graceHours: number;
  readonly dueSoonHours: number;
  readonly termsVersion: number | null;
}

/** Read-only stand-in for a SyncTx so seam helpers that take `tx` can run outside a transaction. */
export async function readTx(ctx: Pick<Ctx, "orgId">): Promise<Tx> {
  const db = await readDb(ctx);
  return { db, orgId: ctx.orgId, syncVersion: 0 } satisfies Partial<DbSyncTx>;
}

export function asSyncTx(tx: Tx): SyncTx {
  return dbTx(tx) as unknown as SyncTx;
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export async function loadSettings(tx: Tx): Promise<RentalSettings> {
  const t = dbTx(tx);
  const org = await collections.organizations(await getDb()).findOne(
    { _id: t.orgId },
    { projection: { settings: 1 }, ...(t.session === undefined ? {} : { session: t.session }) },
  );
  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  const terms = (settings.rentalTerms ?? null) as { version?: unknown } | null;
  return {
    graceHours: num(settings.rentalGraceHours, 2),
    dueSoonHours: num(settings.rentalDueSoonHours, 24),
    termsVersion: typeof terms?.version === "number" ? terms.version : null,
  };
}

export async function loadRental(tx: Tx, rentalId: string): Promise<Rental> {
  const doc = await dbTx(tx).db.rentals.findOne({ _id: rentalId, deletedAt: null });
  if (doc === null) return reject("RENTAL_NOT_FOUND", { rentalId });
  return doc;
}

export async function loadDamage(tx: Tx, damageId: string): Promise<Damage> {
  const doc = await dbTx(tx).db.damages.findOne({ _id: damageId, deletedAt: null });
  if (doc === null) return reject("NOT_FOUND", { entityType: "DAMAGE", entityId: damageId });
  return doc;
}

export function fieldError(path: string, code: string): never {
  throw new AppError("VALIDATION_FAILED", { fieldErrors: [{ path, code }] });
}

export function isOffice(ctx: Pick<Ctx, "role">): boolean {
  return ctx.role === "ADMIN" || ctx.role === "MANAGER";
}

/** Runs the rental state machine (ARCHITECTURE §6.3) and maps its result to an error code. */
export function assertTransition(rental: Pick<Rental, "status"> | null, action: rentalMachine.RentalAction, guard: rentalMachine.RentalGuardInput): void {
  const result = rentalMachine.canTransition(rental?.status ?? null, action, guard);
  if (result.ok) return;
  if (result.code === "OFFICE_ROLE_REQUIRED") reject("FORBIDDEN", { action });
  reject(result.code, { action, from: rental?.status ?? null, ...(result.codes === undefined ? {} : { codes: result.codes }) });
}

export function rentalNumber(n: number): string {
  return `RN-${String(n).padStart(6, "0")}`;
}

export function toRentalDto(doc: Rental, customer: Pick<Customer, "_id" | "name" | "taxId" | "taxIdType"> | null, revealTaxId: boolean): RentalDTO {
  const dto = toDto<RentalDTO>(doc);
  if (customer === null) return dto;
  const taxId = customer.taxId ?? null;
  return {
    ...dto,
    customerSnapshot: {
      id: customer._id,
      name: customer.name,
      taxIdType: customer.taxIdType ?? (taxId === null ? null : taxIdKind(taxId)),
      taxId: revealTaxId ? taxId : null,
      taxIdMasked: taxId === null ? null : maskTaxId(taxId),
    },
  };
}

export async function rentalDto(tx: Tx, ctx: Pick<Ctx, "role">, doc: Rental): Promise<RentalDTO> {
  const customer = await dbTx(tx).db.customers.findOne({ _id: doc.customerId }, { projection: { _id: 1, name: 1, taxId: 1, taxIdType: 1 } });
  return toRentalDto(doc, customer, isOffice(ctx));
}

export const toInspectionDto = (doc: Inspection): InspectionDTO => toDto<InspectionDTO>(doc);
export const toDamageDto = (doc: Damage): DamageDTO => toDto<DamageDTO>(doc);
export const toChargeDto = (doc: RentalCharge): RentalChargeDTO => toDto<RentalChargeDTO>(doc);

export interface EligibilityArgs {
  readonly direction: RentalDirection;
  readonly assetId: string;
  readonly customerId?: string | null;
  readonly siteId?: string | null;
  readonly from: Date;
  readonly to: Date;
  readonly excludeRentalId?: string | null;
}

export async function hasBlockingReport(tx: Tx, assetId: string): Promise<boolean> {
  const report = await dbTx(tx).db.field_reports.findOne(
    { assetId, deletedAt: null, status: { $in: [...OPEN_REPORT_STATUSES] }, $or: [{ machineOperable: false }, { priority: "CRITICAL" }] },
    { projection: { _id: 1 } },
  );
  return report !== null;
}

export async function overlappingRental(tx: Tx, args: Pick<EligibilityArgs, "assetId" | "from" | "to" | "excludeRentalId">): Promise<Rental | null> {
  const filter: Record<string, unknown> = {
    assetId: args.assetId,
    deletedAt: null,
    status: { $in: ["RESERVED", "ACTIVE"] },
    plannedStart: { $lt: args.to },
    plannedEnd: { $gt: args.from },
  };
  if (args.excludeRentalId !== undefined && args.excludeRentalId !== null) filter._id = { $ne: args.excludeRentalId };
  return dbTx(tx).db.rentals.findOne(filter);
}

/** Loads the inputs of `checkRentalEligibility` (ARCHITECTURE §6.3); site mismatch is only a warning (EC-RN-05). */
export async function evaluateEligibility(tx: Tx, args: EligibilityArgs): Promise<EligibilityResult & { readonly asset: AssetSummary }> {
  const asset = await getSummary(tx, args.assetId);
  const [critical, overlap] = await Promise.all([hasBlockingReport(tx, args.assetId), overlappingRental(tx, args)]);
  let hasDocument = true;
  let hasPhone = true;
  if (args.customerId !== undefined && args.customerId !== null) {
    const customer = await dbTx(tx).db.customers.findOne({ _id: args.customerId, deletedAt: null });
    if (customer === null) return reject("NOT_FOUND", { entityType: "CUSTOMER", entityId: args.customerId });
    const filled = (value: string | null | undefined) => value !== null && value !== undefined && value.trim().length > 0;
    hasDocument = filled(customer.taxId);
    hasPhone = filled(customer.phone) || filled(customer.whatsapp);
  }
  const result = checkRentalEligibility({
    direction: args.direction,
    assetRentable: asset.isRentable,
    assetCondition: asset.condition,
    hasCriticalOpenReport: critical,
    hasOverlappingReservedOrActiveRental: overlap !== null,
    customerHasDocument: hasDocument,
    customerHasPhone: hasPhone,
  });
  const warnings: RentalWarningCode[] = [];
  if (args.siteId !== undefined && args.siteId !== null && asset.currentSiteId !== null && asset.currentSiteId !== args.siteId) {
    warnings.push("RENTAL_SITE_MISMATCH");
  }
  return { eligible: result.eligible, codes: result.codes, warnings, asset };
}

export function assertDates(start: Date, end: Date, now: Date, { allowPastStart = false } = {}): void {
  if (!(end.getTime() > start.getTime())) reject("RENTAL_DATES_INVALID", { reason: "endBeforeStart" });
  if (!allowPastStart && start.getTime() < now.getTime() - START_PAST_TOLERANCE_MS) reject("RENTAL_DATES_INVALID", { reason: "startInPast" });
  if (end.getTime() <= now.getTime()) reject("RENTAL_DATES_INVALID", { reason: "endInPast" });
}

export async function emitRental(tx: Tx, rental: Pick<Rental, "_id" | "status">, syncVersion: number): Promise<void> {
  await emit(asSyncTx(tx), {
    type: "entity:changed",
    entity: { entityType: "RENTAL", entityId: rental._id },
    data: { entityType: "RENTAL", id: rental._id, status: rental.status, version: String(syncVersion) },
  });
}

export async function emitAsset(tx: Tx, assetId: string, syncVersion: number): Promise<void> {
  await emit(asSyncTx(tx), {
    type: "entity:changed",
    entity: { entityType: "ASSET", entityId: assetId },
    data: { entityType: "ASSET", id: assetId, version: String(syncVersion) },
  });
}

/** Bumps the asset's syncVersion so its derived custody reaches devices and concurrent reservations conflict. */
export async function touchAsset(tx: Tx, assetId: string): Promise<void> {
  const t = dbTx(tx);
  await t.db.assets.updateOne({ _id: assetId }, { $set: stampUpdate(t) });
}

// ───────── Charges (ARCHITECTURE §7.4) ─────────

/** A damage charge is held while it is disputed or its match is unclear; waived damages are never charged. */
export function isHeld(damage: Pick<Damage, "disputeStatus" | "matchStatus">): boolean {
  return damage.disputeStatus === "DISPUTED" || damage.matchStatus === "UNCLEAR";
}

export function isChargeable(damage: Pick<Damage, "disputeStatus" | "matchStatus" | "isPreExisting">): boolean {
  return !damage.isPreExisting && damage.matchStatus === "NEW" && damage.disputeStatus !== "DISPUTED" && damage.disputeStatus !== "WAIVED";
}

export interface ChargeSources {
  readonly rental: Rental;
  readonly asset: Pick<AssetSummary, "tankCapacityL">;
  readonly checkOut: Pick<Inspection, "hourMeter" | "fuelPercent" | "accessories"> | null;
  readonly checkIn: Pick<Inspection, "hourMeter" | "fuelPercent" | "accessories"> | null;
  readonly damages: readonly Pick<Damage, "_id" | "estimatedCostCents" | "disputeStatus" | "matchStatus" | "isPreExisting">[];
  readonly manual: readonly RentalCharge[];
  readonly graceHours: number;
  readonly accessoryLabels?: ReadonlyMap<string, string>;
}

export function missingAccessories(
  checkOut: Pick<Inspection, "accessories"> | null,
  checkIn: Pick<Inspection, "accessories"> | null,
  labels: ReadonlyMap<string, string> = new Map(),
): ChargesInput["missingAccessories"] {
  if (checkOut === null || checkIn === null) return [];
  const returned = new Map(checkIn.accessories.map((line) => [line.accessoryKey, line]));
  const out: { accessoryKey: string; label: string; missingQty: number; replacementCostCents: number }[] = [];
  for (const line of checkOut.accessories) {
    const back = returned.get(line.accessoryKey);
    const missingQty = Math.max(0, line.present - (back?.present ?? 0));
    if (missingQty === 0) continue;
    out.push({
      accessoryKey: line.accessoryKey,
      label: labels.get(line.accessoryKey) ?? line.accessoryKey,
      missingQty,
      replacementCostCents: back?.replacementCostCents ?? line.replacementCostCents ?? 0,
    });
  }
  return out;
}

export function chargesInputOf(s: ChargeSources): ChargesInput {
  const r = s.rental;
  const manualLines: ManualChargeLine[] = s.manual.map((line) => ({
    type: line.type,
    description: line.description,
    quantity: line.quantity,
    unitAmountCents: line.unitAmountCents,
    amountCents: line.amountCents,
    isAuto: false,
    ...(line.damageId === null || line.damageId === undefined ? {} : { damageId: line.damageId }),
    ...(line.accessoryKey === null || line.accessoryKey === undefined ? {} : { accessoryKey: line.accessoryKey }),
  }));
  return {
    rateCents: r.rateCents,
    rateUnit: r.rateUnit,
    plannedStart: r.plannedStart,
    plannedEnd: r.plannedEnd,
    actualStart: r.actualStart ?? r.plannedStart,
    actualEnd: r.actualEnd ?? new Date(),
    graceHours: s.graceHours,
    lateFeePerDayCents: r.lateFeePerDayCents ?? null,
    includedHoursPerDay: r.includedHoursPerDay ?? null,
    extraHourRateCents: r.extraHourRateCents ?? null,
    checkOutHourMeter: s.checkOut?.hourMeter ?? null,
    checkInHourMeter: s.checkIn?.hourMeter ?? null,
    fuelPolicy: r.fuelPolicy,
    checkOutFuelPct: s.checkOut?.fuelPercent ?? null,
    checkInFuelPct: s.checkIn?.fuelPercent ?? null,
    tankCapacityL: s.asset.tankCapacityL,
    fuelPriceCents: r.fuelPriceCents ?? null,
    newDamages: s.damages.filter(isChargeable).map((d) => ({ damageId: d._id, estimatedCostCents: d.estimatedCostCents ?? null })),
    missingAccessories: missingAccessories(s.checkOut, s.checkIn, s.accessoryLabels),
    depositCents: r.depositCents,
    manualLines,
  };
}

function lineKey(line: Pick<ChargeLine, "type" | "quantity" | "unitAmountCents" | "amountCents"> & { damageId?: string | null; accessoryKey?: string | null }): string {
  return [line.type, line.quantity, line.unitAmountCents, line.amountCents, line.damageId ?? "", line.accessoryKey ?? ""].join("|");
}

export async function accessoryLabels(tx: Tx, templateId: string | null | undefined, locale: string): Promise<Map<string, string>> {
  if (templateId === null || templateId === undefined) return new Map();
  const template = await dbTx(tx).db.checklist_templates.findOne({ _id: templateId }, { projection: { accessories: 1 } });
  const labels = new Map<string, string>();
  for (const def of template?.accessories ?? []) {
    const text = def.label as Record<string, string>;
    labels.set(def.accessoryKey, text[locale] ?? text["pt-BR"] ?? def.accessoryKey);
  }
  return labels;
}

/** Loads everything the charge computation needs for a rental, inside the caller's transaction. */
export async function chargeSources(tx: Tx, rental: Rental, graceHours?: number): Promise<ChargeSources> {
  const db = dbTx(tx).db;
  const [asset, checkOut, checkIn, damages, manual, settings] = await Promise.all([
    getSummary(tx, rental.assetId),
    rental.checkOutInspectionId == null ? null : db.inspections.findOne({ _id: rental.checkOutInspectionId }),
    rental.checkInInspectionId == null ? null : db.inspections.findOne({ _id: rental.checkInInspectionId }),
    db.damages.find({ detectedRentalId: rental._id, deletedAt: null }).toArray(),
    db.rental_charges.find({ rentalId: rental._id, isAuto: false, deletedAt: null }).toArray(),
    graceHours === undefined ? loadSettings(tx) : Promise.resolve(null),
  ]);
  const labels = await accessoryLabels(tx, checkOut?.templateId, rental.documentLocale);
  return { rental, asset, checkOut, checkIn, damages, manual, graceHours: graceHours ?? settings?.graceHours ?? 2, accessoryLabels: labels };
}

/**
 * Server-side charge recomputation: replaces the auto lines when they differ and refreshes the
 * rental totals. Returns whether anything changed. `bumpVersion` increments `chargesVersion`
 * (office edits and recomputations that differ, EC-RN-28).
 */
export async function persistCharges(tx: Tx, rental: Rental, sources: ChargeSources, opts: { readonly bumpVersion: boolean }): Promise<{ changed: boolean; totalCents: number; balanceDueCents: number; chargesVersion: number }> {
  const t = dbTx(tx);
  const summary = summarizeRentalCharges(chargesInputOf(sources));
  const autoLines = summary.lines.filter((line) => line.isAuto);
  const existing = await t.db.rental_charges.find({ rentalId: rental._id, isAuto: true, deletedAt: null }).toArray();
  const before = existing.map(lineKey).sort().join("\n");
  const after = autoLines.map(lineKey).sort().join("\n");
  const linesChanged = before !== after;
  const now = new Date();
  if (linesChanged) {
    if (existing.length > 0) {
      await t.db.rental_charges.updateMany(
        { _id: { $in: existing.map((line) => line._id) } },
        { $set: { deletedAt: now, syncVersion: t.syncVersion, updatedAt: now } },
      );
    }
    for (const line of autoLines) {
      await t.db.rental_charges.insertOne({
        _id: newId(),
        ...stampCreate(t, now),
        deletedAt: null,
        rentalId: rental._id,
        type: line.type,
        description: line.description,
        quantity: line.quantity,
        unitAmountCents: line.unitAmountCents,
        amountCents: line.amountCents,
        isAuto: true,
        damageId: line.damageId ?? null,
        accessoryKey: line.accessoryKey ?? null,
      } as RentalCharge);
    }
  }
  const totalsChanged = rental.chargesTotalCents !== summary.totalCents || rental.balanceDueCents !== summary.balanceDueCents;
  const changed = linesChanged || totalsChanged;
  const chargesVersion = changed && opts.bumpVersion ? rental.chargesVersion + 1 : rental.chargesVersion;
  if (changed) {
    await t.db.rentals.updateOne(
      { _id: rental._id },
      { $set: { chargesTotalCents: summary.totalCents, balanceDueCents: summary.balanceDueCents, chargesVersion, ...stampUpdate(t, now) } },
    );
  }
  return { changed, totalCents: summary.totalCents, balanceDueCents: summary.balanceDueCents, chargesVersion };
}
