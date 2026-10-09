import { MUTATION_PAYLOADS } from "@agrorende/contracts/mutations";
import type { MutationName } from "@agrorende/contracts/sync";

import { ANY_ROLE } from "../../permissions.js";
import type { MutationHandler } from "../../sync/types.js";
import { unavailableApply } from "../mutationStub.js";

export const mutations: Pick<Record<MutationName, MutationHandler<unknown>>, "fuelLog.create"> = {
  "fuelLog.create": { schema: MUTATION_PAYLOADS["fuelLog.create"], allowedRoles: ANY_ROLE, access: "any", rejectionCodes: ["VALIDATION_FAILED", "UNKNOWN_MUTATION"], apply: unavailableApply("fuelLog.create") },
};
