import type { InspectionMedia, RentalValidationAsset, RentalValidationInspection, RentalValidationRental } from "@agrorende/contracts/charges";
import { isChecklistComplete } from "@agrorende/contracts/checklist";
import type { InspectionType, MediaTag } from "@agrorende/contracts/enums";
import type { CheckOutInspection, DamageInput } from "@agrorende/contracts/mutations";
import type { AssetSummary } from "@agrorende/contracts/seams";
import type { MediaMeta } from "@agrorende/contracts/sync";
import type { Damage, Inspection } from "@agrorende/db";

import type { Ctx } from "../../context";
import { reject } from "../../errors";
import type { MutationMeta, SyncTx } from "../../sync/types";
import { dbTx } from "../assets/kit";
import { registerMedia } from "../media/service";
import { fieldError } from "./internal";

/** The inspection payload fields shared by check-out, check-in and `inspection.submit`. */
export type InspectionPayload = Omit<CheckOutInspection, "safetyBriefingGiven" | "termsAccepted"> & {
  safetyBriefingGiven?: boolean;
  termsAccepted?: boolean;
};

const WALKAROUND: readonly MediaTag[] = ["WALKAROUND_FRONT", "WALKAROUND_REAR", "WALKAROUND_LEFT", "WALKAROUND_RIGHT", "WALKAROUND_CAB"];

/** Items named in `GUARD_CHECKOUT_INCOMPLETE` / `GUARD_CHECKIN_INCOMPLETE` details so the wizard can jump to the step. */
export type MissingItem = "walkaround" | "readings" | "fuel" | "checklist" | "knownDamages" | "briefing" | "terms" | "signatures";

/** Server time for the inspection: the device clock unless it is skewed (EC-SY clock rules). */
export function performedAt(meta: Pick<MutationMeta, "occurredAt" | "receivedAt" | "clockSkewed">): Date {
  return meta.clockSkewed ? meta.receivedAt : meta.occurredAt;
}

/** Unrepaired, non-deleted damages currently open on the asset. */
export async function openDamages(tx: SyncTx, assetId: string): Promise<Damage[]> {
  return dbTx(tx).db.damages.find({ assetId, deletedAt: null, repairedAt: null }).sort({ createdAt: 1, _id: 1 }).toArray();
}

/**
 * Payload media plus media already registered for this inspection (uploaded through
 * `media.register` before the composite mutation reached the server).
 */
export async function inspectionMedia(tx: SyncTx, inspectionId: string, payload: readonly MediaMeta[]): Promise<InspectionMedia[]> {
  const stored = await dbTx(tx).db.media.find({ "parent.type": "INSPECTION", "parent.id": inspectionId, deletedAt: null }, { projection: { _id: 1, tag: 1 } }).toArray();
  const out = new Map<string, InspectionMedia>();
  for (const item of stored) out.set(item._id, { id: item._id, tag: item.tag });
  for (const item of payload) out.set(item.id, { id: item.id, tag: item.tag as MediaTag });
  return [...out.values()];
}

/** Damage inputs that confirm an already-open damage instead of describing a new one. */
export function isConfirmation(input: DamageInput): boolean {
  return input.matchedDamageId !== undefined && input.matchStatus === "MATCHED";
}

export function validationInspection(type: InspectionType, inspection: InspectionPayload): RentalValidationInspection {
  const matched = inspection.damages.filter((damage) => damage.matchedDamageId !== undefined);
  return {
    type,
    templateSnapshot: inspection.templateSnapshot,
    responses: inspection.responses,
    hourMeter: inspection.hourMeter ?? null,
    fuelPercent: inspection.fuelPercent ?? null,
    safetyBriefingGiven: inspection.safetyBriefingGiven ?? false,
    operatorName: inspection.operatorName ?? null,
    termsAccepted: inspection.termsAccepted ?? false,
    signatureStatus: inspection.signatureStatus,
    signatureReason: inspection.signatureReason ?? null,
    customerSignatureMediaId: inspection.customerSignatureMediaId ?? null,
    agentSignatureMediaId: inspection.agentSignatureMediaId,
    confirmedOpenDamageIds: matched.filter(isConfirmation).map((damage) => damage.matchedDamageId as string),
    damageAnswers: matched.map((damage) => ({ damageId: damage.matchedDamageId as string, matchedDamageId: damage.matchedDamageId ?? null, present: true })),
  };
}

/** Mirrors `validateCheckOut` / `validateCheckIn` item by item so the rejection names what is missing. */
export function missingItems(
  type: "CHECK_OUT" | "CHECK_IN",
  inspection: RentalValidationInspection,
  media: readonly InspectionMedia[],
  rental: RentalValidationRental,
  asset: RentalValidationAsset,
): MissingItem[] {
  const tags = new Set(media.map((item) => item.tag));
  const ids = new Set(media.map((item) => item.id));
  const hasTank = asset.tankCapacityL != null;
  const missing: MissingItem[] = [];
  if (!WALKAROUND.every((tag) => tags.has(tag))) missing.push("walkaround");
  if (!tags.has("HOUR_METER") || (asset.category !== "IMPLEMENT" && inspection.hourMeter == null)) missing.push("readings");
  if (hasTank && (!tags.has("FUEL_GAUGE") || inspection.fuelPercent == null)) missing.push("fuel");
  if (!isChecklistComplete(inspection.templateSnapshot, inspection.responses, ids)) missing.push("checklist");
  const answered = new Set((inspection.damageAnswers ?? []).map((answer) => answer.damageId));
  if (!asset.openDamageIds.every((damageId) => answered.has(damageId))) missing.push("knownDamages");
  if (type === "CHECK_OUT") {
    if (rental.direction === "OUTBOUND" && (inspection.safetyBriefingGiven !== true || (inspection.operatorName?.trim() ?? "").length === 0)) missing.push("briefing");
    if (inspection.termsAccepted !== true) missing.push("terms");
    if (inspection.signatureStatus !== "SIGNED" || inspection.customerSignatureMediaId == null) missing.push("signatures");
  }
  return missing;
}

/** EC-RN-37: the signatures the step requires must be present as media on this inspection. */
export function assertSignatures(type: "CHECK_OUT" | "CHECK_IN", inspection: InspectionPayload, media: readonly InspectionMedia[]): void {
  const ids = new Set(media.map((item) => item.id));
  const agentOk = ids.has(inspection.agentSignatureMediaId);
  if (type === "CHECK_OUT") {
    const customerOk = inspection.signatureStatus === "SIGNED" && inspection.customerSignatureMediaId !== undefined && ids.has(inspection.customerSignatureMediaId);
    if (!agentOk || !customerOk) reject("GUARD_SIGNATURE_REQUIRED", { agent: agentOk, customer: customerOk });
    return;
  }
  const customerOk = inspection.signatureStatus !== "SIGNED" || (inspection.customerSignatureMediaId !== undefined && ids.has(inspection.customerSignatureMediaId));
  const reasonOk = inspection.signatureStatus === "SIGNED" || (inspection.signatureReason?.trim() ?? "").length > 0 || inspection.signatureStatus === "ABSENT";
  if (!agentOk || !customerOk || !reasonOk) reject("GUARD_SIGNATURE_REQUIRED", { agent: agentOk, customer: customerOk });
}

/**
 * Monotonic reading guard (EC-RN-09, EC-RN-26). `baseline` is the asset reading at check-out
 * or the check-out reading at check-in; `maxDelta` bounds the hour-meter jump.
 */
export function assertReadings(
  inspection: Pick<InspectionPayload, "hourMeter" | "odometerKm" | "meterReplaced" | "meterPhotoMediaId" | "meterJumpConfirmed">,
  media: readonly InspectionMedia[],
  baseline: { hourMeter: number | null; odometerKm: number | null },
  maxHourDelta?: number,
): void {
  if (inspection.meterReplaced === true) {
    if (inspection.meterPhotoMediaId === undefined || !media.some((item) => item.id === inspection.meterPhotoMediaId)) fieldError("meterPhotoMediaId", "required");
    return;
  }
  if (inspection.hourMeter !== undefined && baseline.hourMeter !== null && inspection.hourMeter < baseline.hourMeter) {
    reject("METER_READING_LOWER", { field: "hourMeter", previous: baseline.hourMeter, value: inspection.hourMeter });
  }
  if (inspection.odometerKm !== undefined && baseline.odometerKm !== null && inspection.odometerKm < baseline.odometerKm) {
    reject("METER_READING_LOWER", { field: "odometerKm", previous: baseline.odometerKm, value: inspection.odometerKm });
  }
  if (inspection.meterJumpConfirmed !== true && maxHourDelta !== undefined && inspection.hourMeter !== undefined && baseline.hourMeter !== null && inspection.hourMeter - baseline.hourMeter > maxHourDelta) {
    reject("METER_READING_JUMP", { field: "hourMeter", previous: baseline.hourMeter, value: inspection.hourMeter, maxDelta: maxHourDelta });
  }
}

export interface RecordInspectionArgs {
  readonly type: InspectionType;
  readonly rentalId: string;
  readonly asset: AssetSummary;
  readonly inspection: InspectionPayload;
  readonly performedAt: Date;
  readonly meta: Pick<MutationMeta, "lat" | "lng">;
  readonly termsVersion?: number | null;
  /** Called for every damage that is stored (confirmations of open damages are not stored). */
  readonly damageDefaults: (input: DamageInput) => Partial<Damage>;
}

/**
 * Inserts the inspection, its media and its damages. Idempotent on the inspection id: a replay
 * returns `replayed: true` and writes nothing.
 */
export async function recordInspection(tx: SyncTx, ctx: Ctx, args: RecordInspectionArgs): Promise<{ inspection: Inspection; damages: Damage[]; replayed: boolean }> {
  const t = dbTx(tx);
  const { inspection: p } = args;
  const existing = await t.db.inspections.findOne({ _id: p.id });
  if (existing !== null) {
    if (existing.rentalId !== args.rentalId || existing.type !== args.type) reject("CONFLICT", { reason: "inspection.exists", inspectionId: p.id });
    const damages = await t.db.damages.find({ detectedInspectionId: p.id, deletedAt: null }).toArray();
    return { inspection: existing, damages, replayed: true };
  }
  const now = new Date();
  const doc: Inspection = {
    _id: p.id,
    organizationId: ctx.orgId,
    syncVersion: t.syncVersion,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    type: args.type,
    rentalId: args.rentalId,
    assetId: p.assetId,
    performedById: ctx.userId,
    performedAt: args.performedAt,
    templateId: p.templateId,
    templateVersion: p.templateVersion,
    templateSnapshot: p.templateSnapshot,
    responses: p.responses,
    hourMeter: p.hourMeter ?? null,
    odometerKm: p.odometerKm ?? null,
    fuelPercent: p.fuelPercent ?? null,
    accessories: p.accessories,
    safetyBriefingGiven: p.safetyBriefingGiven ?? false,
    operatorName: p.operatorName ?? null,
    operatorDocument: p.operatorDocument ?? null,
    termsAccepted: p.termsAccepted ?? false,
    termsVersion: args.termsVersion ?? null,
    documentLocale: p.documentLocale,
    signerName: p.signerName ?? null,
    signerDocument: p.signerDocument ?? null,
    signerRole: p.signerRole ?? null,
    signatureStatus: p.signatureStatus,
    signatureReason: p.signatureReason ?? null,
    customerSignatureMediaId: p.customerSignatureMediaId ?? null,
    agentSignatureMediaId: p.agentSignatureMediaId,
    lat: args.meta.lat ?? null,
    lng: args.meta.lng ?? null,
    notes: p.notes ?? null,
  };
  await t.db.inspections.insertOne(doc);

  const damages: Damage[] = [];
  for (const input of p.damages) {
    if (isConfirmation(input)) continue;
    const damage: Damage = {
      _id: input.id,
      organizationId: ctx.orgId,
      syncVersion: t.syncVersion,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      assetId: p.assetId,
      zone: input.zone,
      severity: input.severity,
      description: input.description ?? null,
      isPreExisting: input.isPreExisting,
      detectedInspectionId: p.id,
      detectedRentalId: null,
      matchedDamageId: input.matchedDamageId ?? null,
      matchStatus: input.matchStatus,
      disputeStatus: (input.customerStatement?.trim() ?? "").length > 0 ? "DISPUTED" : "NONE",
      customerStatement: input.customerStatement ?? null,
      fieldReportId: null,
      estimatedCostCents: input.estimatedCostCents ?? null,
      reportedById: ctx.userId,
      repairedAt: null,
      repairedWorkOrderId: null,
      ...args.damageDefaults(input),
    };
    const clash = await t.db.damages.findOne({ _id: damage._id }, { projection: { _id: 1 } });
    if (clash !== null) reject("CONFLICT", { reason: "damage.exists", damageId: damage._id });
    await t.db.damages.insertOne(damage);
    damages.push(damage);
  }

  for (const meta of p.media) {
    if (meta.parent.type !== "INSPECTION" || meta.parent.id !== p.id) fieldError("media.parent", "invalid");
    await registerMedia(tx, ctx, meta, { parentChecked: true });
  }
  return { inspection: doc, damages, replayed: false };
}
