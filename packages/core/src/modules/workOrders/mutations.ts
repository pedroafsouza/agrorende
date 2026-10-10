import { MUTATION_PAYLOADS } from "@agrorende/contracts/mutations";
import type {
  WorkOrderAddPartPayload,
  WorkOrderCompletePayload,
  WorkOrderRemovePartPayload,
  WorkOrderSaveChecklistPayload,
  WorkOrderTransitionPayload,
} from "@agrorende/contracts/mutations";
import type { MutationName } from "@agrorende/contracts/sync";

import { ANY_ROLE } from "../../permissions";
import type { MutationHandler } from "../../sync/types";
import { complete, saveChecklist, transition } from "./field";
import { addPart, removePart } from "./parts";

const transitionHandler: MutationHandler<WorkOrderTransitionPayload> = {
  schema: MUTATION_PAYLOADS["workOrder.transition"],
  allowedRoles: ANY_ROLE,
  access: "assignee",
  rejectionCodes: ["INVALID_TRANSITION", "WO_CANCELLED", "WO_REASSIGNED", "VALIDATION_FAILED", "OFFICE_ROLE_REQUIRED", "WO_SAFETY_STOP_REQUIRED", "NOT_FOUND"],
  async apply(tx, ctx, payload, meta) {
    await transition(tx, ctx, payload, meta);
    return {};
  },
};

const completeHandler: MutationHandler<WorkOrderCompletePayload> = {
  schema: MUTATION_PAYLOADS["workOrder.complete"],
  allowedRoles: ANY_ROLE,
  access: "assignee",
  rejectionCodes: [
    "GUARD_RESOLUTION_REQUIRED",
    "GUARD_AFTER_PHOTO_REQUIRED",
    "GUARD_CHECKLIST_INCOMPLETE",
    "GUARD_SIGNATURE_REQUIRED",
    "WO_CANCELLED",
    "WO_REASSIGNED",
    "INVALID_TRANSITION",
    "WO_ALREADY_VERIFIED",
    "WO_SAFETY_STOP_REQUIRED",
    "METER_READING_LOWER",
    "METER_READING_JUMP",
    "VALIDATION_FAILED",
    "NOT_FOUND",
  ],
  async apply(tx, ctx, payload, meta) {
    await complete(tx, ctx, payload, meta);
    return {};
  },
};

const saveChecklistHandler: MutationHandler<WorkOrderSaveChecklistPayload> = {
  schema: MUTATION_PAYLOADS["workOrder.saveChecklist"],
  allowedRoles: ANY_ROLE,
  access: "assigneeOrPrevious",
  rejectionCodes: ["NOT_FOUND", "FORBIDDEN"],
  async apply(tx, ctx, payload, meta) {
    await saveChecklist(tx, ctx, payload, meta);
    return {};
  },
};

const addPartHandler: MutationHandler<WorkOrderAddPartPayload> = {
  schema: MUTATION_PAYLOADS["workOrder.addPart"],
  allowedRoles: ANY_ROLE,
  access: "assigneeOrPrevious",
  rejectionCodes: ["NOT_FOUND", "FORBIDDEN", "CONFLICT"],
  async apply(tx, ctx, payload, meta) {
    await addPart(tx, ctx, payload, meta.occurredAt);
    return {};
  },
};

const removePartHandler: MutationHandler<WorkOrderRemovePartPayload> = {
  schema: MUTATION_PAYLOADS["workOrder.removePart"],
  allowedRoles: ANY_ROLE,
  access: "assigneeOrPrevious",
  rejectionCodes: ["NOT_FOUND", "FORBIDDEN"],
  async apply(tx, ctx, payload, meta) {
    await removePart(tx, ctx, payload.id, meta.occurredAt);
    return {};
  },
};

export const mutations: Pick<Record<MutationName, MutationHandler<unknown>>, "workOrder.transition" | "workOrder.complete" | "workOrder.saveChecklist" | "workOrder.addPart" | "workOrder.removePart"> = {
  "workOrder.transition": transitionHandler as MutationHandler<unknown>,
  "workOrder.complete": completeHandler as MutationHandler<unknown>,
  "workOrder.saveChecklist": saveChecklistHandler as MutationHandler<unknown>,
  "workOrder.addPart": addPartHandler as MutationHandler<unknown>,
  "workOrder.removePart": removePartHandler as MutationHandler<unknown>,
};
