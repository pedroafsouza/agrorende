import { MUTATION_PAYLOADS } from "@agrorende/contracts/mutations";
import type { MutationName } from "@agrorende/contracts/sync";

import { ANY_ROLE } from "../../permissions.js";
import type { MutationHandler } from "../../sync/types.js";
import { stubApply } from "../mutationStub.js";

export const mutations: Pick<Record<MutationName, MutationHandler<unknown>>, "asset.updateReadings"> = {
  "asset.updateReadings": { schema: MUTATION_PAYLOADS["asset.updateReadings"], allowedRoles: ANY_ROLE, access: "any", rejectionCodes: [], apply: stubApply("asset.updateReadings") },
};
