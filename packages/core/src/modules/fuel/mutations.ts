import { MUTATION_PAYLOADS, type FuelLogCreatePayload } from "@agrorende/contracts/mutations";
import type { MutationName } from "@agrorende/contracts/sync";

import { ANY_ROLE } from "../../permissions";
import type { MutationHandler } from "../../sync/types";
import { createFuelLog } from "./service";

/** Any role logs fuel (OFF-01). A lower hour meter is accepted on the log and ignored for the asset. */
const create: MutationHandler<FuelLogCreatePayload> = {
  schema: MUTATION_PAYLOADS["fuelLog.create"] as MutationHandler<FuelLogCreatePayload>["schema"],
  allowedRoles: ANY_ROLE,
  access: "any",
  rejectionCodes: ["VALIDATION_FAILED", "NOT_FOUND"],
  async apply(tx, ctx, payload, meta) {
    await createFuelLog(tx, ctx, payload, {
      occurredAt: meta.occurredAt,
      ...(meta.lat === undefined ? {} : { lat: meta.lat }),
      ...(meta.lng === undefined ? {} : { lng: meta.lng }),
    });
    return {};
  },
};

export const mutations: Pick<Record<MutationName, MutationHandler<unknown>>, "fuelLog.create"> = {
  "fuelLog.create": create as MutationHandler<unknown>,
};
