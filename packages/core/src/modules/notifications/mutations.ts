import { MUTATION_PAYLOADS } from "@agrorende/contracts/mutations";
import type { MutationName } from "@agrorende/contracts/sync";

import { ANY_ROLE } from "../../permissions.js";
import type { MutationHandler } from "../../sync/types.js";
import { stubApply } from "../mutationStub.js";

export const mutations: Pick<Record<MutationName, MutationHandler<unknown>>, "notification.markRead"> = {
  "notification.markRead": { schema: MUTATION_PAYLOADS["notification.markRead"], allowedRoles: ANY_ROLE, access: "self", rejectionCodes: [], apply: stubApply("notification.markRead") },
};
