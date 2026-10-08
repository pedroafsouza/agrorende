import { MUTATION_PAYLOADS } from "@agrorende/contracts/mutations";
import type { MutationName } from "@agrorende/contracts/sync";

import { ANY_ROLE } from "../../permissions.js";
import type { MutationHandler } from "../../sync/types.js";
import { stubApply } from "../mutationStub.js";

export const mutations: Pick<Record<MutationName, MutationHandler<unknown>>, "comment.create"> = {
  "comment.create": { schema: MUTATION_PAYLOADS["comment.create"], allowedRoles: ANY_ROLE, access: "anyoneWithParentAccess", rejectionCodes: ["NOT_FOUND"], apply: stubApply("comment.create") },
};
