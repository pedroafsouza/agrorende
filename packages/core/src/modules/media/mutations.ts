import { MUTATION_PAYLOADS } from "@agrorende/contracts/mutations";
import type { MutationName } from "@agrorende/contracts/sync";

import { ANY_ROLE } from "../../permissions.js";
import type { MutationHandler } from "../../sync/types.js";
import { stubApply } from "../mutationStub.js";

export const mutations: Pick<Record<MutationName, MutationHandler<unknown>>, "media.register" | "media.update" | "media.delete"> = {
  "media.register": { schema: MUTATION_PAYLOADS["media.register"], allowedRoles: ANY_ROLE, access: "anyoneWithParentAccess", rejectionCodes: ["NOT_FOUND", "FORBIDDEN"], apply: stubApply("media.register") },
  "media.update": { schema: MUTATION_PAYLOADS["media.update"], allowedRoles: ANY_ROLE, access: "capturer", rejectionCodes: ["NOT_FOUND"], apply: stubApply("media.update") },
  "media.delete": { schema: MUTATION_PAYLOADS["media.delete"], allowedRoles: ANY_ROLE, access: "capturer", rejectionCodes: ["MEDIA_LOCKED"], apply: stubApply("media.delete") },
};
