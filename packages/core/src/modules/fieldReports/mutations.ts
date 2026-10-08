import { MUTATION_PAYLOADS } from "@agrorende/contracts/mutations";
import type { MutationName } from "@agrorende/contracts/sync";

import { ANY_ROLE } from "../../permissions.js";
import type { MutationHandler } from "../../sync/types.js";
import { stubApply } from "../mutationStub.js";

export const mutations: Pick<Record<MutationName, MutationHandler<unknown>>, "fieldReport.create" | "fieldReport.update" | "fieldReport.withdraw"> = {
  "fieldReport.create": { schema: MUTATION_PAYLOADS["fieldReport.create"], allowedRoles: ANY_ROLE, access: "any", rejectionCodes: ["VALIDATION_FAILED"], apply: stubApply("fieldReport.create") },
  "fieldReport.update": { schema: MUTATION_PAYLOADS["fieldReport.update"], allowedRoles: ANY_ROLE, access: "reporter", rejectionCodes: ["REPORT_LOCKED"], apply: stubApply("fieldReport.update") },
  "fieldReport.withdraw": { schema: MUTATION_PAYLOADS["fieldReport.withdraw"], allowedRoles: ANY_ROLE, access: "reporter", rejectionCodes: ["REPORT_LOCKED"], apply: stubApply("fieldReport.withdraw") },
};
