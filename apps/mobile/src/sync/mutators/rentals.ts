import type { CheckInInspection, CheckOutInspection, DamageInput, InspectionSubmitPayload } from "@agrorende/contracts/mutations";
import type { InspectionType } from "@agrorende/contracts/enums";

import { getMirrorRow, patchMirrorRow, upsertMirrorRow } from "../../db/mirror";
import type { SqlDb } from "../../db/sql";
import { defineMutator, writeOptimisticMedia, type MutatorContext } from "../mutator";

export type { LocalMutationResult } from "../mutator";

type AnyInspection = CheckOutInspection | CheckInInspection | InspectionSubmitPayload;

function checkOutFields(inspection: AnyInspection): Partial<CheckOutInspection> {
  return "termsAccepted" in inspection ? (inspection as CheckOutInspection) : {};
}

/** Optimistic `inspections` row with every mirror column, as the server stores it (§7.3). */
async function writeInspection(tx: SqlDb, inspection: AnyInspection, type: InspectionType, rentalId: string | null, ctx: MutatorContext): Promise<void> {
  const existing = await getMirrorRow(tx, "inspections", inspection.id);
  const co = checkOutFields(inspection);
  await upsertMirrorRow(
    tx,
    "inspections",
    {
      id: inspection.id,
      organizationId: existing?.organizationId ?? "",
      syncVersion: existing?.syncVersion ?? 0,
      createdAt: existing?.createdAt ?? ctx.now,
      updatedAt: ctx.now,
      deletedAt: null,
      type,
      rentalId,
      assetId: inspection.assetId,
      performedById: ctx.runtime.userId,
      performedAt: existing?.performedAt ?? ctx.now,
      templateId: inspection.templateId,
      templateVersion: inspection.templateVersion,
      templateSnapshot: inspection.templateSnapshot,
      responses: inspection.responses,
      hourMeter: inspection.hourMeter ?? null,
      odometerKm: inspection.odometerKm ?? null,
      fuelPercent: inspection.fuelPercent ?? null,
      accessories: inspection.accessories,
      safetyBriefingGiven: co.safetyBriefingGiven ?? false,
      operatorName: co.operatorName ?? null,
      operatorDocument: co.operatorDocument ?? null,
      termsAccepted: co.termsAccepted ?? false,
      termsVersion: co.termsVersion ?? null,
      documentLocale: inspection.documentLocale,
      signerName: inspection.signerName ?? null,
      signerDocument: inspection.signerDocument ?? null,
      signerRole: inspection.signerRole ?? null,
      signatureStatus: inspection.signatureStatus,
      signatureReason: inspection.signatureReason ?? null,
      customerSignatureMediaId: inspection.customerSignatureMediaId ?? null,
      agentSignatureMediaId: inspection.agentSignatureMediaId,
      lat: existing?.lat ?? null,
      lng: existing?.lng ?? null,
      notes: inspection.notes ?? null,
    },
    1,
  );
  await writeOptimisticMedia(tx, inspection.media, ctx);
}

/**
 * New damages recorded by the inspection. A damage confirmed as "same as before"
 * (MATCHED with `matchedDamageId`) is a confirmation, not a new row, like on the server.
 */
async function writeDamages(
  tx: SqlDb,
  inspection: AnyInspection,
  rentalId: string | null,
  isPreExisting: boolean,
  costs: ReadonlyMap<string, number>,
  ctx: MutatorContext,
): Promise<void> {
  for (const damage of inspection.damages as readonly DamageInput[]) {
    if (damage.matchStatus === "MATCHED" && damage.matchedDamageId !== undefined) continue;
    const existing = await getMirrorRow(tx, "damages", damage.id);
    await upsertMirrorRow(
      tx,
      "damages",
      {
        id: damage.id,
        organizationId: existing?.organizationId ?? "",
        syncVersion: existing?.syncVersion ?? 0,
        createdAt: existing?.createdAt ?? ctx.now,
        updatedAt: ctx.now,
        deletedAt: null,
        assetId: inspection.assetId,
        zone: damage.zone,
        severity: damage.severity,
        description: damage.description ?? null,
        isPreExisting: isPreExisting || damage.isPreExisting,
        detectedInspectionId: inspection.id,
        detectedRentalId: rentalId,
        matchedDamageId: damage.matchedDamageId ?? null,
        matchStatus: damage.matchStatus,
        disputeStatus: existing?.disputeStatus ?? null,
        customerStatement: damage.customerStatement ?? null,
        fieldReportId: existing?.fieldReportId ?? null,
        estimatedCostCents: costs.get(damage.id) ?? damage.estimatedCostCents ?? null,
        reportedById: ctx.runtime.userId,
        repairedAt: null,
        repairedWorkOrderId: null,
      },
      1,
    );
  }
}

/** `inspection.submit`: a standalone inspection that never changes the rental status. */
export const submitInspection = defineMutator({
  name: "inspection.submit",
  entityType: "INSPECTION",
  entityId: (payload) => payload.id,
  apply: async (tx, payload, ctx) => {
    const rental = payload.rentalId === undefined ? undefined : await getMirrorRow(tx, "rentals", payload.rentalId);
    const type: InspectionType = rental === undefined || rental.status === "DRAFT" || rental.status === "RESERVED" ? "CHECK_OUT" : "CHECK_IN";
    await writeInspection(tx, payload, type, payload.rentalId ?? null, ctx);
    await writeDamages(tx, payload, payload.rentalId ?? null, type === "CHECK_OUT", new Map(), ctx);
  },
});

/** `rental.checkout` (F3): RESERVED → ACTIVE with the check-out evidence, fully offline. */
export const checkoutRental = defineMutator({
  name: "rental.checkout",
  entityType: "RENTAL",
  entityId: (payload) => payload.rentalId,
  apply: async (tx, payload, ctx) => {
    const { inspection } = payload;
    await writeInspection(tx, inspection, "CHECK_OUT", payload.rentalId, ctx);
    await writeDamages(tx, inspection, payload.rentalId, true, new Map(), ctx);
    await patchMirrorRow(tx, "rentals", payload.rentalId, {
      status: "ACTIVE",
      actualStart: ctx.now,
      checkOutInspectionId: inspection.id,
      documentLocale: inspection.documentLocale,
      ...(inspection.termsVersion === undefined ? {} : { termsVersion: inspection.termsVersion }),
      updatedAt: ctx.now,
    });
    await patchMirrorRow(tx, "assets", inspection.assetId, {
      currentRentalId: payload.rentalId,
      ...(inspection.hourMeter === undefined ? {} : { hourMeter: inspection.hourMeter }),
      updatedAt: ctx.now,
    });
  },
});

/** `rental.checkin` (F3): ACTIVE → RETURNED; the server computes the final charges. */
export const checkinRental = defineMutator({
  name: "rental.checkin",
  entityType: "RENTAL",
  entityId: (payload) => payload.rentalId,
  apply: async (tx, payload, ctx) => {
    const { inspection } = payload;
    const costs = new Map(payload.damageCosts.map((cost) => [cost.damageId, cost.estimatedCostCents]));
    await writeInspection(tx, inspection, "CHECK_IN", payload.rentalId, ctx);
    await writeDamages(tx, inspection, payload.rentalId, false, costs, ctx);
    await patchMirrorRow(tx, "rentals", payload.rentalId, {
      status: "RETURNED",
      actualEnd: ctx.now,
      checkInInspectionId: inspection.id,
      updatedAt: ctx.now,
    });
    await patchMirrorRow(tx, "assets", inspection.assetId, {
      currentRentalId: null,
      ...(inspection.hourMeter === undefined ? {} : { hourMeter: inspection.hourMeter }),
      updatedAt: ctx.now,
    });
  },
});
