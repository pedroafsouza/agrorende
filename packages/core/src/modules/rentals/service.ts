import type { DamageDTO, RentalChargeDTO, RentalDTO } from "@agrorende/contracts/dto";
import type { Tx } from "@agrorende/contracts/seams";
import type { Damage, Rental, RentalCharge } from "@agrorende/db";

import type { Ctx } from "../../context.js";
import { reject } from "../../errors.js";
import { next as nextNumber } from "../../numbering/index.js";
import { createWorkOrderFromSource } from "../../seams.js";
import { touchDependents } from "../../sync/touch.js";
import { assertVersion, dbTx, newId, parseInput, stampCreate, stampUpdate, writeActivity } from "../assets/kit.js";
import { getSummary, recomputeCondition } from "../assets/service.js";
import { currentSeasonId } from "../seasons/service.js";
import {
  DamagePatchInputSchema,
  DamageWorkOrderInputSchema,
  ManualChargeInputSchema,
  RentalCancelInputSchema,
  RentalCloseInputSchema,
  RentalCreateInputSchema,
  RentalExtendInputSchema,
  RentalUpdateInputSchema,
  type DamagePatchInput,
  type DamageWorkOrderInput,
  type ManualChargeInput,
  type RentalCancelInput,
  type RentalCloseInput,
  type RentalCreateInput,
  type RentalExtendInput,
  type RentalUpdateInput,
} from "./dto.js";
import {
  asSyncTx,
  assertDates,
  assertTransition,
  chargeSources,
  emitAsset,
  emitRental,
  evaluateEligibility,
  fieldError,
  isHeld,
  isOffice,
  loadDamage,
  loadRental,
  overlappingRental,
  persistCharges,
  rentalDto,
  rentalNumber,
  toChargeDto,
  toDamageDto,
  touchAsset,
} from "./internal.js";

export { toRentalDto } from "./internal.js";

const date = (value: string | Date): Date => (value instanceof Date ? value : new Date(value));

function requireOffice(ctx: Ctx): void {
  if (!isOffice(ctx)) reject("FORBIDDEN", { roles: ["ADMIN", "MANAGER"] });
}

// ───────── Seams (DELIVERY-PLAN §4, `RentalSeams`) ─────────

/** Seam `rentals.markDamagesRepaired`: called by T07 when a work order created from damages completes. */
export async function markDamagesRepaired(tx: Tx, input: { workOrderId: string; damageIds: string[] }): Promise<void> {
  if (input.damageIds.length === 0) return;
  const t = dbTx(tx);
  const damages = await t.db.damages.find({ _id: { $in: input.damageIds }, deletedAt: null, repairedAt: null }).toArray();
  if (damages.length === 0) return;
  const now = new Date();
  await t.db.damages.updateMany(
    { _id: { $in: damages.map((damage) => damage._id) } },
    { $set: { repairedAt: now, repairedWorkOrderId: input.workOrderId, ...stampUpdate(t, now) } },
  );
  for (const damage of damages) {
    await writeActivity(t, {
      entityType: "DAMAGE",
      entityId: damage._id,
      action: "damage.repaired",
      meta: { workOrderId: input.workOrderId, assetId: damage.assetId },
      occurredAt: now,
    });
  }
  for (const assetId of new Set(damages.map((damage) => damage.assetId))) {
    await recomputeCondition(tx, assetId);
  }
}

/** Seam `rentals.activeRentalForAsset`: the ACTIVE rental that currently holds the asset, if any. */
export async function activeRentalForAsset(tx: Tx, assetId: string): Promise<{ id: string; number: string } | null> {
  const rental = await dbTx(tx).db.rentals.findOne(
    { assetId, status: "ACTIVE", deletedAt: null },
    { projection: { _id: 1, number: 1 }, sort: { actualStart: -1 } },
  );
  return rental === null ? null : { id: rental._id, number: rental.number };
}

// ───────── Rental lifecycle (office REST) ─────────

export async function createRental(tx: Tx, ctx: Ctx, raw: RentalCreateInput): Promise<RentalDTO> {
  requireOffice(ctx);
  const input = parseInput(RentalCreateInputSchema, raw);
  const t = dbTx(tx);
  const plannedStart = date(input.plannedStart);
  const plannedEnd = date(input.plannedEnd);
  assertDates(plannedStart, plannedEnd, new Date());
  const asset = await getSummary(tx, input.assetId);
  const customer = await t.db.customers.findOne({ _id: input.customerId, deletedAt: null }, { projection: { _id: 1 } });
  if (customer === null) fieldError("customerId", "notFound");
  const rateCents = input.rateCents ?? asset.defaultRateCents;
  if (rateCents === null || rateCents === undefined) {
    fieldError("rateCents", "required");
  }
  const rateUnit = input.rateUnit ?? asset.defaultRateUnit ?? "DAY";
  const id = input.id ?? newId();
  const existing = await t.db.rentals.findOne({ _id: id }, { projection: { _id: 1 } });
  if (existing !== null) reject("CONFLICT", { reason: "rental.exists", rentalId: id });
  const number = rentalNumber(await nextNumber(ctx, { key: "RN" }));
  const now = new Date();
  const doc: Rental = {
    _id: id,
    organizationId: ctx.orgId,
    ...stampCreate(t, now),
    deletedAt: null,
    number,
    direction: input.direction,
    status: "DRAFT",
    assetId: input.assetId,
    customerId: input.customerId,
    siteId: input.siteId ?? asset.currentSiteId ?? asset.homeSiteId ?? null,
    seasonId: await currentSeasonId(tx, ctx.orgId),
    agentId: input.agentId ?? null,
    createdById: ctx.userId,
    plannedStart,
    plannedEnd,
    actualStart: null,
    actualEnd: null,
    rateCents,
    rateUnit,
    depositCents: input.depositCents,
    includedHoursPerDay: input.includedHoursPerDay ?? null,
    extraHourRateCents: input.extraHourRateCents ?? null,
    lateFeePerDayCents: input.lateFeePerDayCents ?? null,
    fuelPolicy: input.fuelPolicy,
    fuelPriceCents: input.fuelPriceCents ?? null,
    deliveryMode: input.deliveryMode,
    deliveryAddress: input.deliveryAddress ?? null,
    deliverySiteId: input.deliverySiteId ?? null,
    deliveryLat: input.deliveryLat ?? null,
    deliveryLng: input.deliveryLng ?? null,
    documentLocale: input.documentLocale,
    termsVersion: null,
    notes: input.notes ?? null,
    checkOutInspectionId: null,
    checkInInspectionId: null,
    chargesTotalCents: null,
    chargesVersion: 1,
    balanceDueCents: null,
  };
  await t.db.rentals.insertOne(doc);
  await writeActivity(t, { entityType: "RENTAL", entityId: id, action: "rental.created", actorId: ctx.userId, toStatus: "DRAFT", meta: { number, assetId: input.assetId }, occurredAt: now });
  await emitRental(tx, doc, t.syncVersion);
  return rentalDto(tx, ctx, doc);
}

const RESCHEDULE_FIELDS = ["assetId", "plannedStart", "plannedEnd", "customerId"] as const;

export async function updateRental(tx: Tx, ctx: Ctx, rentalId: string, raw: RentalUpdateInput, ifMatch?: string | null): Promise<RentalDTO> {
  requireOffice(ctx);
  const input = parseInput(RentalUpdateInputSchema, raw);
  const t = dbTx(tx);
  const rental = await loadRental(tx, rentalId);
  assertVersion(rental, ifMatch);
  if (rental.status !== "DRAFT" && rental.status !== "RESERVED") reject("INVALID_TRANSITION", { action: "update", from: rental.status });
  const set: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    set[key] = key === "plannedStart" || key === "plannedEnd" ? date(value as string) : value;
  }
  if (set.customerId !== undefined) {
    const customer = await t.db.customers.findOne({ _id: set.customerId as string, deletedAt: null }, { projection: { _id: 1 } });
    if (customer === null) fieldError("customerId", "notFound");
  }
  const next = { ...rental, ...set } as Rental;
  if (set.plannedStart !== undefined || set.plannedEnd !== undefined) {
    assertDates(next.plannedStart, next.plannedEnd, new Date(), { allowPastStart: set.plannedStart === undefined });
  }
  if (set.assetId !== undefined) await getSummary(tx, next.assetId);
  if (rental.status === "RESERVED" && RESCHEDULE_FIELDS.some((key) => set[key] !== undefined)) {
    const result = await evaluateEligibility(tx, {
      direction: next.direction,
      assetId: next.assetId,
      customerId: next.customerId,
      siteId: next.siteId ?? null,
      from: next.plannedStart,
      to: next.plannedEnd,
      excludeRentalId: rental._id,
    });
    if (!result.eligible) reject(result.codes[0] ?? "VALIDATION_FAILED", { codes: result.codes, warnings: result.warnings });
    await touchAsset(tx, next.assetId);
    if (next.assetId !== rental.assetId) await touchAsset(tx, rental.assetId);
  }
  const now = new Date();
  await t.db.rentals.updateOne({ _id: rentalId }, { $set: { ...set, ...stampUpdate(t, now) } });
  await writeActivity(t, { entityType: "RENTAL", entityId: rentalId, action: "rental.updated", actorId: ctx.userId, meta: { fields: Object.keys(set) }, occurredAt: now });
  const updated = await loadRental(tx, rentalId);
  await emitRental(tx, updated, t.syncVersion);
  return rentalDto(tx, ctx, updated);
}

/** DRAFT → RESERVED. Eligibility is re-checked inside the transaction (EC-RN-01..05, 35, 36). */
export async function reserveRental(tx: Tx, ctx: Ctx, rentalId: string, ifMatch?: string | null): Promise<RentalDTO> {
  const t = dbTx(tx);
  const rental = await loadRental(tx, rentalId);
  assertVersion(rental, ifMatch);
  assertTransition(rental, "reserve", {
    actorRole: ctx.role,
    eligibility: {
      direction: rental.direction,
      assetRentable: true,
      assetCondition: "OPERATIONAL",
      hasCriticalOpenReport: false,
      hasOverlappingReservedOrActiveRental: false,
      customerHasDocument: true,
      customerHasPhone: true,
    },
  });
  if (rental.plannedEnd.getTime() <= Date.now()) reject("RENTAL_DATES_INVALID", { reason: "endInPast" });
  const result = await evaluateEligibility(tx, {
    direction: rental.direction,
    assetId: rental.assetId,
    customerId: rental.customerId,
    siteId: rental.siteId ?? null,
    from: rental.plannedStart,
    to: rental.plannedEnd,
    excludeRentalId: rental._id,
  });
  if (!result.eligible) reject(result.codes[0] ?? "VALIDATION_FAILED", { codes: result.codes, warnings: result.warnings });
  const now = new Date();
  await touchAsset(tx, rental.assetId);
  await t.db.rentals.updateOne({ _id: rentalId }, { $set: { status: "RESERVED", ...stampUpdate(t, now) } });
  await writeActivity(t, {
    entityType: "RENTAL",
    entityId: rentalId,
    action: "rental.reserved",
    actorId: ctx.userId,
    fromStatus: "DRAFT",
    toStatus: "RESERVED",
    meta: result.warnings.length > 0 ? { warnings: result.warnings } : {},
    occurredAt: now,
  });
  await touchDependents(asSyncTx(tx), { entityType: "RENTAL", entityId: rentalId });
  const updated = await loadRental(tx, rentalId);
  await emitRental(tx, updated, t.syncVersion);
  await emitAsset(tx, rental.assetId, t.syncVersion);
  return rentalDto(tx, ctx, updated);
}

export async function cancelRental(tx: Tx, ctx: Ctx, rentalId: string, raw: RentalCancelInput): Promise<RentalDTO> {
  const input = parseInput(RentalCancelInputSchema, raw);
  const t = dbTx(tx);
  const rental = await loadRental(tx, rentalId);
  assertTransition(rental, "cancel", { actorRole: ctx.role, reason: input.reason });
  const now = new Date();
  await t.db.rentals.updateOne({ _id: rentalId }, { $set: { status: "CANCELLED", cancelledAt: now, cancelReason: input.reason, ...stampUpdate(t, now) } });
  if (rental.status === "RESERVED") {
    await touchAsset(tx, rental.assetId);
    await emitAsset(tx, rental.assetId, t.syncVersion);
  }
  await writeActivity(t, { entityType: "RENTAL", entityId: rentalId, action: "rental.cancelled", actorId: ctx.userId, fromStatus: rental.status, toStatus: "CANCELLED", meta: { reason: input.reason }, occurredAt: now });
  const updated = await loadRental(tx, rentalId);
  await emitRental(tx, updated, t.syncVersion);
  return rentalDto(tx, ctx, updated);
}

/** P1 extension: new planned end, still free of overlaps (EC-RN-32). */
export async function extendRental(tx: Tx, ctx: Ctx, rentalId: string, raw: RentalExtendInput): Promise<RentalDTO> {
  const input = parseInput(RentalExtendInputSchema, raw);
  const t = dbTx(tx);
  const rental = await loadRental(tx, rentalId);
  assertTransition(rental, "extend", { actorRole: ctx.role });
  const plannedEnd = date(input.newPlannedEnd);
  assertDates(rental.plannedStart, plannedEnd, new Date(), { allowPastStart: true });
  const clash = await overlappingRental(tx, { assetId: rental.assetId, from: rental.plannedStart, to: plannedEnd, excludeRentalId: rental._id });
  if (clash !== null) reject("ASSET_DOUBLE_BOOKED", { rentalId: clash._id, number: clash.number });
  const now = new Date();
  await touchAsset(tx, rental.assetId);
  await t.db.rentals.updateOne({ _id: rentalId }, { $set: { plannedEnd, dueSoonNotifiedAt: null, overdueNotifiedAt: null, ...stampUpdate(t, now) } });
  await writeActivity(t, { entityType: "RENTAL", entityId: rentalId, action: "rental.extended", actorId: ctx.userId, meta: { from: rental.plannedEnd.toISOString(), to: plannedEnd.toISOString() }, occurredAt: now });
  const updated = await loadRental(tx, rentalId);
  await emitRental(tx, updated, t.syncVersion);
  return rentalDto(tx, ctx, updated);
}

/** RETURNED → CLOSED. Held damages (disputed or unclear) block close; a stale charges version is rejected (EC-RN-28). */
export async function closeRental(tx: Tx, ctx: Ctx, rentalId: string, raw: RentalCloseInput = {}): Promise<RentalDTO> {
  const input = parseInput(RentalCloseInputSchema, raw);
  const t = dbTx(tx);
  const rental = await loadRental(tx, rentalId);
  assertTransition(rental, "close", { actorRole: ctx.role, hasOpenDamageDisputes: false });
  const damages = await t.db.damages.find({ detectedRentalId: rentalId, deletedAt: null }).toArray();
  const held = damages.filter(isHeld).map((damage) => damage._id);
  if (held.length > 0) reject("VALIDATION_FAILED", { reason: "damageHeld", damageIds: held });
  if (input.chargesVersion !== undefined && input.chargesVersion !== rental.chargesVersion) {
    reject("RENTAL_CHARGES_UPDATED", {
      chargesVersion: rental.chargesVersion,
      totalCents: rental.chargesTotalCents ?? null,
      balanceDueCents: rental.balanceDueCents ?? null,
    });
  }
  const now = new Date();
  await t.db.rentals.updateOne(
    { _id: rentalId },
    { $set: { status: "CLOSED", closedAt: now, closedById: ctx.userId, settlementRef: input.paymentNote ?? null, ...stampUpdate(t, now) } },
  );
  await writeActivity(t, { entityType: "RENTAL", entityId: rentalId, action: "rental.closed", actorId: ctx.userId, fromStatus: "RETURNED", toStatus: "CLOSED", meta: { totalCents: rental.chargesTotalCents ?? 0 }, occurredAt: now });
  const updated = await loadRental(tx, rentalId);
  await emitRental(tx, updated, t.syncVersion);
  return rentalDto(tx, ctx, updated);
}

// ───────── Charges (`updateCharges`, RETURNED only) ─────────

async function returnedRental(tx: Tx, ctx: Ctx, rentalId: string): Promise<Rental> {
  const rental = await loadRental(tx, rentalId);
  assertTransition(rental, "updateCharges", { actorRole: ctx.role });
  return rental;
}

async function chargeLines(tx: Tx, rentalId: string): Promise<RentalChargeDTO[]> {
  const lines = await dbTx(tx).db.rental_charges.find({ rentalId, deletedAt: null }).sort({ isAuto: -1, createdAt: 1, _id: 1 }).toArray();
  return lines.map(toChargeDto);
}

export async function recomputeCharges(tx: Tx, ctx: Ctx, rentalId: string): Promise<RentalChargeDTO[]> {
  const t = dbTx(tx);
  const rental = await returnedRental(tx, ctx, rentalId);
  const result = await persistCharges(tx, rental, await chargeSources(tx, rental), { bumpVersion: true });
  if (result.changed) {
    await writeActivity(t, { entityType: "RENTAL", entityId: rentalId, action: "rental.chargesRecomputed", actorId: ctx.userId, meta: { totalCents: result.totalCents, chargesVersion: result.chargesVersion } });
    await emitRental(tx, await loadRental(tx, rentalId), t.syncVersion);
  }
  return chargeLines(tx, rentalId);
}

/** Recomputes totals after a manual line changed; manual edits always bump `chargesVersion`. */
async function refreshAfterManualEdit(tx: Tx, ctx: Ctx, rental: Rental, action: string, meta: Record<string, unknown>): Promise<void> {
  const t = dbTx(tx);
  const result = await persistCharges(tx, rental, await chargeSources(tx, rental), { bumpVersion: false });
  const now = new Date();
  const chargesVersion = result.chargesVersion + 1;
  await t.db.rentals.updateOne({ _id: rental._id }, { $set: { chargesVersion, ...stampUpdate(t, now) } });
  await writeActivity(t, { entityType: "RENTAL", entityId: rental._id, action, actorId: ctx.userId, meta: { ...meta, totalCents: result.totalCents, chargesVersion }, occurredAt: now });
  await emitRental(tx, await loadRental(tx, rental._id), t.syncVersion);
}

export async function addManualCharge(tx: Tx, ctx: Ctx, rentalId: string, raw: ManualChargeInput): Promise<RentalChargeDTO> {
  const input = parseInput(ManualChargeInputSchema, raw);
  const t = dbTx(tx);
  const rental = await returnedRental(tx, ctx, rentalId);
  const sign = input.type === "DISCOUNT" ? -1 : 1;
  const unitAmountCents = sign * Math.abs(input.unitAmountCents);
  const now = new Date();
  const doc: RentalCharge = {
    _id: newId(),
    organizationId: ctx.orgId,
    ...stampCreate(t, now),
    deletedAt: null,
    rentalId,
    type: input.type,
    description: input.description,
    quantity: input.quantity,
    unitAmountCents,
    amountCents: Math.round(input.quantity * unitAmountCents),
    isAuto: false,
    damageId: input.damageId ?? null,
    accessoryKey: input.accessoryKey ?? null,
  };
  await t.db.rental_charges.insertOne(doc);
  await refreshAfterManualEdit(tx, ctx, rental, "rental.chargeAdded", { lineId: doc._id, type: doc.type, amountCents: doc.amountCents });
  return toChargeDto(doc);
}

export async function deleteManualCharge(tx: Tx, ctx: Ctx, rentalId: string, lineId: string): Promise<void> {
  const t = dbTx(tx);
  const rental = await returnedRental(tx, ctx, rentalId);
  const line = await t.db.rental_charges.findOne({ _id: lineId, rentalId, deletedAt: null });
  if (line === null) reject("NOT_FOUND", { entityType: "RENTAL_CHARGE", entityId: lineId });
  if (line.isAuto) reject("VALIDATION_FAILED", { reason: "autoLine", lineId });
  const now = new Date();
  await t.db.rental_charges.updateOne({ _id: lineId }, { $set: { deletedAt: now, ...stampUpdate(t, now) } });
  await refreshAfterManualEdit(tx, ctx, rental, "rental.chargeRemoved", { lineId, type: line.type, amountCents: line.amountCents });
}

// ───────── Damages (office) ─────────

export async function updateDamage(tx: Tx, ctx: Ctx, damageId: string, raw: DamagePatchInput, ifMatch?: string | null): Promise<DamageDTO> {
  requireOffice(ctx);
  const input = parseInput(DamagePatchInputSchema, raw);
  const t = dbTx(tx);
  const damage = await loadDamage(tx, damageId);
  assertVersion(damage, ifMatch);
  const set: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) if (value !== undefined) set[key] = value;
  const now = new Date();
  await t.db.damages.updateOne({ _id: damageId }, { $set: { ...set, ...stampUpdate(t, now) } });
  await writeActivity(t, {
    entityType: "DAMAGE",
    entityId: damageId,
    action: "damage.updated",
    actorId: ctx.userId,
    meta: { fields: Object.keys(set), rentalId: damage.detectedRentalId ?? null },
    occurredAt: now,
  });
  const rentalId = damage.detectedRentalId ?? null;
  if (rentalId !== null) {
    const rental = await t.db.rentals.findOne({ _id: rentalId, deletedAt: null });
    if (rental !== null && rental.status === "RETURNED") {
      const result = await persistCharges(tx, rental, await chargeSources(tx, rental), { bumpVersion: true });
      if (result.changed) await emitRental(tx, await loadRental(tx, rentalId), t.syncVersion);
    }
  }
  return toDamageDto(await loadDamage(tx, damageId));
}

/** Creates a corrective work order for one or more open damages through the T07 seam. */
export async function createDamageWorkOrder(tx: Tx, ctx: Ctx, damageId: string, raw: DamageWorkOrderInput = {}): Promise<{ id: string; number: string }> {
  requireOffice(ctx);
  const input = parseInput(DamageWorkOrderInputSchema, raw);
  const t = dbTx(tx);
  const damage = await loadDamage(tx, damageId);
  if (damage.repairedAt !== null && damage.repairedAt !== undefined) reject("VALIDATION_FAILED", { reason: "damageRepaired", damageId });
  const ids = [...new Set([damageId, ...(input.damageIds ?? [])])];
  const found: Pick<Damage, "_id" | "assetId">[] = await t.db.damages.find({ _id: { $in: ids }, deletedAt: null }, { projection: { _id: 1, assetId: 1 } }).toArray();
  if (found.length !== ids.length || found.some((other) => other.assetId !== damage.assetId)) {
    fieldError("damageIds", "invalid");
  }
  const rental = damage.detectedRentalId == null ? null : await t.db.rentals.findOne({ _id: damage.detectedRentalId });
  const base = {
    priority: input.priority,
    title: input.title ?? `${damage.zone} · ${damage.severity}`,
    type: "CORRECTIVE" as const,
    assetId: damage.assetId,
    ...(damage.description == null ? {} : { description: damage.description }),
    ...(input.assigneeId == null ? {} : { assigneeId: input.assigneeId }),
    ...(rental?.customerId == null ? {} : { customerId: rental.customerId }),
    ...(rental?.siteId == null ? {} : { siteId: rental.siteId }),
  };
  const created = rental === null
    ? await createWorkOrderFromSource(tx, ctx, { ...base, source: "MANUAL", damageIds: ids })
    : await createWorkOrderFromSource(tx, ctx, { ...base, source: "DAMAGE", rentalId: rental._id, damageIds: ids });
  await writeActivity(t, { entityType: "DAMAGE", entityId: damageId, action: "damage.workOrderCreated", actorId: ctx.userId, meta: { workOrderId: created.id, number: created.number, damageIds: ids } });
  return created;
}
