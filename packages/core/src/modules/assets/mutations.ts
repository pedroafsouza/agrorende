import { MUTATION_PAYLOADS } from "@agrorende/contracts/mutations";
import type { AssetUpdateReadingsPayload } from "@agrorende/contracts/mutations";
import type { MutationName } from "@agrorende/contracts/sync";

import { ANY_ROLE } from "../../permissions";
import type { MutationHandler } from "../../sync/types";
import { applyReadings } from "./service";

/**
 * `asset.updateReadings` is never rejected when the payload is valid (DELIVERY-PLAN §4):
 * lower readings are ignored by the monotonic rule unless the meter was replaced.
 */
const updateReadings: MutationHandler<AssetUpdateReadingsPayload> = {
  schema: MUTATION_PAYLOADS["asset.updateReadings"],
  allowedRoles: ANY_ROLE,
  access: "any",
  rejectionCodes: [],
  async apply(tx, ctx, payload) {
    const readings: { hourMeter?: number; odometerKm?: number } = {};
    if (payload.hourMeter !== undefined) readings.hourMeter = payload.hourMeter;
    if (payload.odometerKm !== undefined) readings.odometerKm = payload.odometerKm;
    await applyReadings(tx, ctx, payload.assetId, {
      ...readings,
      meterReplaced: payload.meterReplaced === true,
      source: { entityType: "ASSET", entityId: payload.assetId },
    });
    return {};
  },
};

export const mutations: Pick<Record<MutationName, MutationHandler<unknown>>, "asset.updateReadings"> = {
  "asset.updateReadings": updateReadings as MutationHandler<unknown>,
};
