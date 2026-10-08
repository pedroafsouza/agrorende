import { patchMirrorRow } from "../../db/mirror";
import { defineMutator } from "../mutator";

export type { LocalMutationResult } from "../mutator";

export const updateAssetReadings = defineMutator({
  name: "asset.updateReadings",
  entityType: "ASSET",
  entityId: (payload) => payload.assetId,
  apply: async (tx, payload, ctx) => {
    await patchMirrorRow(tx, "assets", payload.assetId, {
      ...(payload.hourMeter === undefined ? {} : { hourMeter: payload.hourMeter }),
      ...(payload.odometerKm === undefined ? {} : { odometerKm: payload.odometerKm }),
      updatedAt: ctx.now,
    });
  },
});
