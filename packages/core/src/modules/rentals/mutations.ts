import { AppError } from "@agrorende/contracts/errors";
import { validateCheckIn, validateCheckOut } from "@agrorende/contracts/charges";
import { MUTATION_PAYLOADS } from "@agrorende/contracts/mutations";
import type { InspectionSubmitPayload, RentalCheckinPayload, RentalCheckoutPayload } from "@agrorende/contracts/mutations";
import type { MutationName } from "@agrorende/contracts/sync";
import type { Rental } from "@agrorende/db";

import type { Ctx } from "../../context.js";
import { reject } from "../../errors.js";
import { ANY_ROLE } from "../../permissions.js";
import { createFieldReportFromDamage } from "../../seams.js";
import { touchDependents } from "../../sync/touch.js";
import type { MutationHandler, MutationMeta, SyncTx } from "../../sync/types.js";
import { dbTx, stampUpdate, writeActivity } from "../assets/kit.js";
import { applyReadings, getSummary, recomputeCondition, setCustody } from "../assets/service.js";
import {
  assertReadings,
  assertSignatures,
  inspectionMedia,
  missingItems,
  openDamages,
  performedAt,
  recordInspection,
  validationInspection,
} from "./inspections.js";
import { DISPUTE_WINDOW_HOURS, HOUR_MS, chargeSources, emitAsset, emitRental, hasBlockingReport, loadRental, loadSettings, persistCharges } from "./internal.js";

function readingsOf(p: { hourMeter?: number | undefined; odometerKm?: number | undefined; meterReplaced?: boolean | undefined }): { hourMeter?: number; odometerKm?: number; meterReplaced: boolean } {
  return {
    ...(p.hourMeter === undefined ? {} : { hourMeter: p.hourMeter }),
    ...(p.odometerKm === undefined ? {} : { odometerKm: p.odometerKm }),
    meterReplaced: p.meterReplaced === true,
  };
}

async function loadForInspection(tx: SyncTx, rentalId: string): Promise<Rental> {
  const rental = await dbTx(tx).db.rentals.findOne({ _id: rentalId, deletedAt: null });
  if (rental === null) reject("RENTAL_NOT_FOUND", { rentalId });
  return rental;
}

// ───────── rental.checkout (RESERVED → ACTIVE) ─────────

export async function checkout(tx: SyncTx, ctx: Ctx, payload: RentalCheckoutPayload, meta: MutationMeta): Promise<void> {
  const t = dbTx(tx);
  const p = payload.inspection;
  const rental = await loadForInspection(tx, payload.rentalId);
  if (rental.status === "ACTIVE" && rental.checkOutInspectionId === p.id) return;
  if (rental.status !== "RESERVED") reject("RENTAL_NOT_RESERVED", { rentalId: rental._id, status: rental.status });
  if (p.assetId !== rental.assetId) reject("RENTAL_ASSET_MISMATCH", { expectedAssetId: rental.assetId, assetId: p.assetId });

  const asset = await getSummary(tx, rental.assetId);
  if (asset.condition !== "OPERATIONAL") reject("ASSET_NOT_OPERATIONAL", { assetId: asset.id, condition: asset.condition });
  if (await hasBlockingReport(tx, asset.id)) reject("ASSET_HAS_CRITICAL_REPORT", { assetId: asset.id });
  if (asset.currentRentalId !== null && asset.currentRentalId !== rental._id) reject("ASSET_DOUBLE_BOOKED", { assetId: asset.id, rentalId: asset.currentRentalId });

  const media = await inspectionMedia(tx, p.id, p.media);
  assertSignatures("CHECK_OUT", p, media);
  const open = await openDamages(tx, asset.id);
  const validation = validationInspection("CHECK_OUT", p);
  const validationRental = { direction: rental.direction, status: rental.status };
  const validationAsset = { category: asset.category, tankCapacityL: asset.tankCapacityL, openDamageIds: open.map((damage) => damage._id) };
  if (!validateCheckOut(validation, media, validationRental, validationAsset).ok) {
    reject("GUARD_CHECKOUT_INCOMPLETE", { missing: missingItems("CHECK_OUT", validation, media, validationRental, validationAsset) });
  }
  assertReadings(p, media, { hourMeter: asset.hourMeter, odometerKm: asset.odometerKm });

  const settings = await loadSettings(tx);
  const signedTerms = p.termsVersion ?? settings.termsVersion;
  const at = performedAt(meta);
  await recordInspection(tx, ctx, {
    type: "CHECK_OUT",
    rentalId: rental._id,
    asset,
    inspection: p,
    performedAt: at,
    meta,
    termsVersion: signedTerms,
    damageDefaults: () => ({ isPreExisting: true, matchStatus: "NEW", detectedRentalId: rental._id }),
  });

  const now = new Date();
  await t.db.rentals.updateOne(
    { _id: rental._id },
    {
      $set: {
        status: "ACTIVE",
        actualStart: at,
        checkOutInspectionId: p.id,
        termsVersion: signedTerms,
        documentLocale: p.documentLocale,
        agentId: rental.agentId ?? ctx.userId,
        ...stampUpdate(t, now),
      },
    },
  );
  await setCustody(tx, asset.id, { currentRentalId: rental._id, ...(rental.siteId == null ? {} : { currentSiteId: rental.siteId }) });
  await applyReadings(tx, ctx, asset.id, { ...readingsOf(p), source: { entityType: "INSPECTION", entityId: p.id } });
  if (signedTerms !== null && settings.termsVersion !== null && signedTerms < settings.termsVersion) {
    await writeActivity(t, {
      entityType: "RENTAL",
      entityId: rental._id,
      action: "rental.termsOlderAccepted",
      actorId: ctx.userId,
      meta: { attention: true, signedVersion: signedTerms, currentVersion: settings.termsVersion },
      occurredAt: at,
    });
  }
  await writeActivity(t, {
    entityType: "RENTAL",
    entityId: rental._id,
    action: "rental.checkedOut",
    actorId: ctx.userId,
    fromStatus: "RESERVED",
    toStatus: "ACTIVE",
    meta: { inspectionId: p.id, hourMeter: p.hourMeter ?? null, fuelPercent: p.fuelPercent ?? null },
    occurredAt: at,
  });
  await touchDependents(tx, { entityType: "RENTAL", entityId: rental._id });
  await emitRental(tx, { _id: rental._id, status: "ACTIVE" }, t.syncVersion);
  await emitAsset(tx, asset.id, t.syncVersion);
}

// ───────── rental.checkin (ACTIVE → RETURNED) ─────────

/** EC-RN-14: a failing field-report seam rolls the whole check-in back with a retryable code. */
async function fieldReportFor(tx: SyncTx, ctx: Ctx, input: { damageId: string; rentalId: string; assetId: string }): Promise<{ id: string; number: string }> {
  try {
    return await createFieldReportFromDamage(tx, ctx, input);
  } catch (error) {
    if (error instanceof AppError && error.code !== "INTERNAL") throw error;
    throw new AppError("RENTAL_DAMAGE_REPORT_FAILED", { details: { damageId: input.damageId } });
  }
}

export async function checkin(tx: SyncTx, ctx: Ctx, payload: RentalCheckinPayload, meta: MutationMeta): Promise<void> {
  const t = dbTx(tx);
  const p = payload.inspection;
  const rental = await loadForInspection(tx, payload.rentalId);
  if (rental.status !== "ACTIVE" && rental.checkInInspectionId === p.id) return;
  if (rental.status !== "ACTIVE") reject("RENTAL_NOT_ACTIVE", { rentalId: rental._id, status: rental.status });
  if (p.assetId !== rental.assetId) reject("RENTAL_ASSET_MISMATCH", { expectedAssetId: rental.assetId, assetId: p.assetId });

  const asset = await getSummary(tx, rental.assetId);
  const media = await inspectionMedia(tx, p.id, p.media);
  assertSignatures("CHECK_IN", p, media);
  const open = await openDamages(tx, asset.id);
  const validation = validationInspection("CHECK_IN", p);
  const validationRental = { direction: rental.direction, status: rental.status };
  const validationAsset = { category: asset.category, tankCapacityL: asset.tankCapacityL, openDamageIds: open.map((damage) => damage._id) };
  if (!validateCheckIn(validation, media, validationRental, validationAsset).ok) {
    reject("GUARD_CHECKIN_INCOMPLETE", { missing: missingItems("CHECK_IN", validation, media, validationRental, validationAsset) });
  }

  const at = performedAt(meta);
  const checkOut = rental.checkOutInspectionId == null ? null : await t.db.inspections.findOne({ _id: rental.checkOutInspectionId });
  const start = rental.actualStart ?? rental.plannedStart;
  const elapsedHours = Math.max(0, (at.getTime() - start.getTime()) / HOUR_MS);
  assertReadings(p, media, { hourMeter: checkOut?.hourMeter ?? null, odometerKm: checkOut?.odometerKm ?? null }, elapsedHours + 1);

  const costs = new Map(payload.damageCosts.map((cost) => [cost.damageId, cost.estimatedCostCents]));
  const { damages } = await recordInspection(tx, ctx, {
    type: "CHECK_IN",
    rentalId: rental._id,
    asset,
    inspection: p,
    performedAt: at,
    meta,
    damageDefaults: (input) => ({
      isPreExisting: false,
      detectedRentalId: rental._id,
      ...(costs.has(input.id) ? { estimatedCostCents: costs.get(input.id) ?? null } : {}),
    }),
  });
  for (const damage of damages) {
    if (damage.matchStatus !== "NEW") continue;
    const report = await fieldReportFor(tx, ctx, { damageId: damage._id, rentalId: rental._id, assetId: asset.id });
    await t.db.damages.updateOne({ _id: damage._id }, { $set: { fieldReportId: report.id, ...stampUpdate(t) } });
  }

  const now = new Date();
  await t.db.rentals.updateOne({ _id: rental._id }, { $set: { status: "RETURNED", actualEnd: at, checkInInspectionId: p.id, ...stampUpdate(t, now) } });
  await setCustody(tx, asset.id, { currentRentalId: null });
  await applyReadings(tx, ctx, asset.id, { ...readingsOf(p), source: { entityType: "INSPECTION", entityId: p.id } });
  if (damages.length > 0) await recomputeCondition(tx, asset.id, ctx.userId);

  const returned = await loadRental(tx, rental._id);
  const charges = await persistCharges(tx, returned, await chargeSources(tx, returned), { bumpVersion: false });

  if (damages.length > 0 && p.signatureStatus !== "SIGNED") {
    await writeActivity(t, {
      entityType: "RENTAL",
      entityId: rental._id,
      action: "rental.damagesNotAcknowledged",
      actorId: ctx.userId,
      meta: {
        attention: true,
        damageIds: damages.map((damage) => damage._id),
        signatureStatus: p.signatureStatus,
        disputeWindowEndsAt: new Date(at.getTime() + DISPUTE_WINDOW_HOURS * HOUR_MS).toISOString(),
      },
      occurredAt: at,
    });
  }
  const differentAgent = rental.agentId != null && rental.agentId !== ctx.userId;
  await writeActivity(t, {
    entityType: "RENTAL",
    entityId: rental._id,
    action: "rental.checkedIn",
    actorId: ctx.userId,
    fromStatus: "ACTIVE",
    toStatus: "RETURNED",
    meta: {
      inspectionId: p.id,
      totalCents: charges.totalCents,
      balanceDueCents: charges.balanceDueCents,
      newDamageIds: damages.map((damage) => damage._id),
      ...(differentAgent ? { differentAgent: true, attention: true, checkOutAgentId: rental.agentId } : {}),
    },
    occurredAt: at,
  });
  await touchDependents(tx, { entityType: "RENTAL", entityId: rental._id });
  await emitRental(tx, { _id: rental._id, status: "RETURNED" }, t.syncVersion);
  await emitAsset(tx, asset.id, t.syncVersion);
}

// ───────── inspection.submit (standalone, no state change) ─────────

export async function submitInspection(tx: SyncTx, ctx: Ctx, payload: InspectionSubmitPayload, meta: MutationMeta): Promise<void> {
  if (payload.rentalId === undefined) {
    throw new AppError("VALIDATION_FAILED", { fieldErrors: [{ path: "rentalId", code: "required" }] });
  }
  const rental = await loadForInspection(tx, payload.rentalId);
  if (payload.assetId !== rental.assetId) reject("RENTAL_ASSET_MISMATCH", { expectedAssetId: rental.assetId, assetId: payload.assetId });
  const asset = await getSummary(tx, rental.assetId);
  const media = await inspectionMedia(tx, payload.id, payload.media);
  if (!media.some((item) => item.id === payload.agentSignatureMediaId)) reject("GUARD_SIGNATURE_REQUIRED", { agent: false });
  const type = rental.status === "DRAFT" || rental.status === "RESERVED" ? "CHECK_OUT" : "CHECK_IN";
  const at = performedAt(meta);
  const { replayed, damages } = await recordInspection(tx, ctx, {
    type,
    rentalId: rental._id,
    asset,
    inspection: payload,
    performedAt: at,
    meta,
    damageDefaults: () => ({ isPreExisting: type === "CHECK_OUT", detectedRentalId: rental._id }),
  });
  if (replayed) return;
  const t = dbTx(tx);
  await writeActivity(t, {
    entityType: "RENTAL",
    entityId: rental._id,
    action: "inspection.submitted",
    actorId: ctx.userId,
    meta: { inspectionId: payload.id, type, damageIds: damages.map((damage) => damage._id) },
    occurredAt: at,
  });
  if (damages.length > 0) await recomputeCondition(tx, asset.id, ctx.userId);
  await emitRental(tx, rental, t.syncVersion);
}

const SHARED_REJECTIONS = [
  "RENTAL_NOT_FOUND",
  "RENTAL_ASSET_MISMATCH",
  "GUARD_SIGNATURE_REQUIRED",
  "METER_READING_LOWER",
  "METER_READING_JUMP",
  "VALIDATION_FAILED",
  "CONFLICT",
] as const;

const submitHandler: MutationHandler<InspectionSubmitPayload> = {
  schema: MUTATION_PAYLOADS["inspection.submit"],
  allowedRoles: ANY_ROLE,
  access: "any",
  rejectionCodes: ["RENTAL_NOT_FOUND", "RENTAL_ASSET_MISMATCH", "GUARD_SIGNATURE_REQUIRED", "VALIDATION_FAILED", "CONFLICT"],
  async apply(tx, ctx, payload, meta) {
    await submitInspection(tx, ctx, payload, meta);
    return {};
  },
};

const checkoutHandler: MutationHandler<RentalCheckoutPayload> = {
  schema: MUTATION_PAYLOADS["rental.checkout"],
  allowedRoles: ANY_ROLE,
  access: "any",
  rejectionCodes: [...SHARED_REJECTIONS, "RENTAL_NOT_RESERVED", "GUARD_CHECKOUT_INCOMPLETE", "ASSET_NOT_OPERATIONAL", "ASSET_HAS_CRITICAL_REPORT", "ASSET_DOUBLE_BOOKED"],
  async apply(tx, ctx, payload, meta) {
    await checkout(tx, ctx, payload, meta);
    return {};
  },
};

const checkinHandler: MutationHandler<RentalCheckinPayload> = {
  schema: MUTATION_PAYLOADS["rental.checkin"],
  allowedRoles: ANY_ROLE,
  access: "any",
  rejectionCodes: [...SHARED_REJECTIONS, "RENTAL_NOT_ACTIVE", "GUARD_CHECKIN_INCOMPLETE"],
  async apply(tx, ctx, payload, meta) {
    await checkin(tx, ctx, payload, meta);
    return {};
  },
};

export const mutations: Pick<Record<MutationName, MutationHandler<unknown>>, "inspection.submit" | "rental.checkout" | "rental.checkin"> = {
  "inspection.submit": submitHandler as MutationHandler<unknown>,
  "rental.checkout": checkoutHandler as MutationHandler<unknown>,
  "rental.checkin": checkinHandler as MutationHandler<unknown>,
};
