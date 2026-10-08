import { MUTATION_PAYLOADS } from "@agrorende/contracts/mutations";
import type { UserSetDutyPayload } from "@agrorende/contracts/mutations";
import type { MutationName } from "@agrorende/contracts/sync";

import { ANY_ROLE } from "../../permissions.js";
import type { MutationHandler } from "../../sync/types.js";
import { setDuty } from "./service.js";

const setDutyHandler: MutationHandler<UserSetDutyPayload> = {
  schema: MUTATION_PAYLOADS["user.setDuty"],
  allowedRoles: ANY_ROLE,
  access: "self",
  rejectionCodes: ["LOCATION_CONSENT_REQUIRED"],
  async apply(tx, ctx, payload) {
    await setDuty(tx, ctx, payload);
    return {};
  },
};

export const mutations: Pick<Record<MutationName, MutationHandler<unknown>>, "user.setDuty"> = {
  "user.setDuty": setDutyHandler as MutationHandler<unknown>,
};
