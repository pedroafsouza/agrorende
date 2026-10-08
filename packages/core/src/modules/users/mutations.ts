import { MUTATION_PAYLOADS } from "@agrorende/contracts/mutations";
import type { MutationName } from "@agrorende/contracts/sync";

import { ANY_ROLE } from "../../permissions.js";
import type { MutationHandler } from "../../sync/types.js";
import { stubApply } from "../mutationStub.js";

export const mutations: Pick<Record<MutationName, MutationHandler<unknown>>, "user.setDuty"> = {
  "user.setDuty": { schema: MUTATION_PAYLOADS["user.setDuty"], allowedRoles: ANY_ROLE, access: "self", rejectionCodes: ["LOCATION_CONSENT_REQUIRED"], apply: stubApply("user.setDuty") },
};
