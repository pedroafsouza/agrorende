import { getMirrorRow, upsertMirrorRow } from "../../db/mirror";
import { defineMutator, writeOptimisticMedia } from "../mutator";

export type { LocalMutationResult } from "../mutator";

/**
 * `fuelLog.create` (ERP-07, OFF-01): the log shows up on the machine's profile immediately; the
 * server fills the season, applies the readings and assigns the final version on push. The client id
 * makes a retried push land on the same log, so an offline log syncs exactly once.
 */
export const createFuelLog = defineMutator({
  name: "fuelLog.create",
  entityType: "FUEL_LOG",
  entityId: (payload) => payload.id,
  apply: async (tx, payload, ctx) => {
    const existing = await getMirrorRow(tx, "fuelLogs", payload.id);
    const price = payload.pricePerLiterCents ?? null;
    await upsertMirrorRow(
      tx,
      "fuelLogs",
      {
        id: payload.id,
        organizationId: existing?.organizationId ?? "",
        syncVersion: existing?.syncVersion ?? 0,
        createdAt: existing?.createdAt ?? ctx.now,
        updatedAt: ctx.now,
        deletedAt: null,
        assetId: payload.assetId,
        liters: payload.liters,
        pricePerLiterCents: price,
        totalCents: price === null ? null : Math.round(payload.liters * price),
        hourMeter: payload.hourMeter ?? null,
        odometerKm: payload.odometerKm ?? null,
        siteId: payload.siteId ?? null,
        plotId: payload.plotId ?? null,
        seasonId: existing?.seasonId ?? null,
        operatorId: ctx.runtime.userId,
        filledAt: existing?.filledAt ?? ctx.now,
        lat: existing?.lat ?? null,
        lng: existing?.lng ?? null,
        notes: payload.notes ?? null,
      },
      1,
    );
    await writeOptimisticMedia(tx, payload.media, ctx);
  },
});
