import { MUTATION_PAYLOADS } from "@agrorende/contracts/mutations";
import type { MutationName } from "@agrorende/contracts/sync";

import { ANY_ROLE } from "../../permissions.js";
import type { MutationHandler } from "../../sync/types.js";
import { stubApply } from "../mutationStub.js";

export const mutations: Pick<Record<MutationName, MutationHandler<unknown>>, "workOrder.transition" | "workOrder.complete" | "workOrder.saveChecklist" | "workOrder.addPart" | "workOrder.removePart"> = {
  "workOrder.transition": { schema: MUTATION_PAYLOADS["workOrder.transition"], allowedRoles: ANY_ROLE, access: "assignee", rejectionCodes: ["INVALID_TRANSITION", "WO_CANCELLED", "WO_REASSIGNED", "VALIDATION_FAILED"], apply: stubApply("workOrder.transition") },
  "workOrder.complete": { schema: MUTATION_PAYLOADS["workOrder.complete"], allowedRoles: ANY_ROLE, access: "assignee", rejectionCodes: ["GUARD_RESOLUTION_REQUIRED", "GUARD_AFTER_PHOTO_REQUIRED", "GUARD_CHECKLIST_INCOMPLETE", "GUARD_SIGNATURE_REQUIRED", "WO_CANCELLED", "WO_REASSIGNED", "INVALID_TRANSITION"], apply: stubApply("workOrder.complete") },
  "workOrder.saveChecklist": { schema: MUTATION_PAYLOADS["workOrder.saveChecklist"], allowedRoles: ANY_ROLE, access: "assigneeOrPrevious", rejectionCodes: [], apply: stubApply("workOrder.saveChecklist") },
  "workOrder.addPart": { schema: MUTATION_PAYLOADS["workOrder.addPart"], allowedRoles: ANY_ROLE, access: "assigneeOrPrevious", rejectionCodes: [], apply: stubApply("workOrder.addPart") },
  "workOrder.removePart": { schema: MUTATION_PAYLOADS["workOrder.removePart"], allowedRoles: ANY_ROLE, access: "assigneeOrPrevious", rejectionCodes: ["NOT_FOUND"], apply: stubApply("workOrder.removePart") },
};
