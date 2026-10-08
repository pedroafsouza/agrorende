import type { HoldReason, Role, SignatureStatus, WorkOrderStatus } from "../enums";

export type WorkOrderAction =
  | "assign"
  | "reassign"
  | "accept"
  | "decline"
  | "startRoute"
  | "arrive"
  | "abortRoute"
  | "startWork"
  | "hold"
  | "resume"
  | "complete"
  | "verify"
  | "reopen"
  | "cancel";

export type WorkOrderErrorCode =
  | "INVALID_TRANSITION"
  | "OFFICE_ROLE_REQUIRED"
  | "WO_CANCELLED"
  | "WO_REASSIGNED"
  | "VALIDATION_FAILED"
  | "GUARD_RESOLUTION_REQUIRED"
  | "GUARD_AFTER_PHOTO_REQUIRED"
  | "GUARD_CHECKLIST_INCOMPLETE"
  | "GUARD_SIGNATURE_REQUIRED";

export interface WorkOrderGuardInput {
  actorRole?: Role;
  isAssignee?: boolean;
  assigneeActiveAndJoined?: boolean;
  holdReason?: HoldReason | null;
  currentHoldReason?: HoldReason | null;
  reason?: string | null;
  resolution?: string | null;
  afterPhotoCount?: number;
  checklistComplete?: boolean;
  requireWoSignature?: boolean;
  signatureStatus?: SignatureStatus | null;
  signatureReason?: string | null;
}

export type WorkOrderTransitionResult =
  | { ok: true; to: WorkOrderStatus }
  | { ok: false; code: WorkOrderErrorCode };

export const WORK_ORDER_TRANSITIONS = {
  assign: { from: ["OPEN"], to: "ASSIGNED" },
  reassign: { from: ["ASSIGNED", "ACCEPTED", "EN_ROUTE", "ON_SITE", "IN_PROGRESS", "ON_HOLD"], to: "ASSIGNED" },
  accept: { from: ["ASSIGNED"], to: "ACCEPTED" },
  decline: { from: ["ASSIGNED"], to: "OPEN" },
  startRoute: { from: ["ACCEPTED", "ON_HOLD"], to: "EN_ROUTE" },
  arrive: { from: ["ACCEPTED", "EN_ROUTE"], to: "ON_SITE" },
  abortRoute: { from: ["EN_ROUTE"], to: "ACCEPTED" },
  startWork: { from: ["ON_SITE"], to: "IN_PROGRESS" },
  hold: { from: ["IN_PROGRESS"], to: "ON_HOLD" },
  resume: { from: ["ON_HOLD"], to: "IN_PROGRESS" },
  complete: { from: ["IN_PROGRESS"], to: "COMPLETED" },
  verify: { from: ["COMPLETED"], to: "VERIFIED" },
  reopen: { from: ["COMPLETED"], to: "IN_PROGRESS" },
  cancel: { from: ["OPEN", "ASSIGNED", "ACCEPTED", "EN_ROUTE", "ON_SITE", "IN_PROGRESS", "ON_HOLD"], to: "CANCELLED" },
} as const satisfies Record<WorkOrderAction, { from: readonly WorkOrderStatus[]; to: WorkOrderStatus }>;

function isOffice(role: Role | undefined): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

function hasText(value: string | null | undefined): boolean {
  return value !== undefined && value !== null && value.trim().length > 0;
}

function hasValidSignature(guard: WorkOrderGuardInput): boolean {
  if (guard.requireWoSignature !== true) return true;
  if (guard.signatureStatus === "SIGNED") return true;
  return (guard.signatureStatus === "ABSENT" || guard.signatureStatus === "REFUSED") && hasText(guard.signatureReason);
}

export function canTransition(
  from: WorkOrderStatus,
  action: WorkOrderAction,
  guard: WorkOrderGuardInput = {},
): WorkOrderTransitionResult {
  if (from === "CANCELLED") return { ok: false, code: "WO_CANCELLED" };

  const transition = WORK_ORDER_TRANSITIONS[action];
  const fromStates: readonly WorkOrderStatus[] = transition.from;
  if (!fromStates.includes(from)) return { ok: false, code: "INVALID_TRANSITION" };

  const officeAction = action === "assign" || action === "reassign" || action === "verify" || action === "reopen" || action === "cancel";
  if (officeAction && !isOffice(guard.actorRole)) return { ok: false, code: "OFFICE_ROLE_REQUIRED" };
  if ((action === "assign" || action === "reassign") && guard.assigneeActiveAndJoined !== true) {
    return { ok: false, code: "VALIDATION_FAILED" };
  }

  const assigneeAction = ["accept", "decline", "startRoute", "arrive", "abortRoute", "startWork", "hold", "complete"].includes(action);
  if (assigneeAction && guard.isAssignee !== true) return { ok: false, code: "WO_REASSIGNED" };

  if (action === "decline" && !hasText(guard.reason)) return { ok: false, code: "VALIDATION_FAILED" };
  if (action === "hold" && guard.holdReason == null) return { ok: false, code: "VALIDATION_FAILED" };
  if (action === "resume") {
    const safetyRelease = guard.currentHoldReason === "SAFETY";
    if (safetyRelease && !isOffice(guard.actorRole)) return { ok: false, code: "OFFICE_ROLE_REQUIRED" };
    if (!safetyRelease && guard.isAssignee !== true) return { ok: false, code: "WO_REASSIGNED" };
  }
  if ((action === "reopen" || action === "cancel") && !hasText(guard.reason)) {
    return { ok: false, code: "VALIDATION_FAILED" };
  }
  if (action === "complete") {
    if (!hasText(guard.resolution)) return { ok: false, code: "GUARD_RESOLUTION_REQUIRED" };
    if ((guard.afterPhotoCount ?? 0) < 1) return { ok: false, code: "GUARD_AFTER_PHOTO_REQUIRED" };
    if (guard.checklistComplete !== true) return { ok: false, code: "GUARD_CHECKLIST_INCOMPLETE" };
    if (!hasValidSignature(guard)) return { ok: false, code: "GUARD_SIGNATURE_REQUIRED" };
  }

  return { ok: true, to: transition.to };
}
