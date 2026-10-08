import type { FieldReportStatus, Role } from "../enums";

export type FieldReportAction = "create" | "startReview" | "markForRepair" | "monitor" | "dismiss" | "withdraw";
export type FieldReportErrorCode = "INVALID_TRANSITION" | "OFFICE_ROLE_REQUIRED" | "VALIDATION_FAILED";

export interface FieldReportGuardInput {
  actorRole?: Role;
  isReporter?: boolean;
  note?: string | null;
  reason?: string | null;
}

export type FieldReportTransitionResult =
  | { ok: true; to: FieldReportStatus }
  | { ok: false; code: FieldReportErrorCode };

export const FIELD_REPORT_TRANSITIONS = {
  create: { from: [null], to: "SUBMITTED" },
  startReview: { from: ["SUBMITTED"], to: "IN_REVIEW" },
  markForRepair: { from: ["SUBMITTED", "IN_REVIEW", "MONITORING"], to: "MARKED_FOR_REPAIR" },
  monitor: { from: ["SUBMITTED", "IN_REVIEW"], to: "MONITORING" },
  dismiss: { from: ["SUBMITTED", "IN_REVIEW", "MONITORING"], to: "DISMISSED" },
  withdraw: { from: ["SUBMITTED"], to: "DISMISSED" },
} as const satisfies Record<FieldReportAction, { from: readonly (FieldReportStatus | null)[]; to: FieldReportStatus }>;

function isOffice(role: Role | undefined): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

function hasText(value: string | null | undefined): boolean {
  return value !== undefined && value !== null && value.trim().length > 0;
}

export function canTransition(
  from: FieldReportStatus | null,
  action: FieldReportAction,
  guard: FieldReportGuardInput = {},
): FieldReportTransitionResult {
  const transition = FIELD_REPORT_TRANSITIONS[action];
  const fromStates: readonly (FieldReportStatus | null)[] = transition.from;
  if (!fromStates.includes(from)) return { ok: false, code: "INVALID_TRANSITION" };

  if (["startReview", "markForRepair", "monitor", "dismiss"].includes(action) && !isOffice(guard.actorRole)) {
    return { ok: false, code: "OFFICE_ROLE_REQUIRED" };
  }
  if (action === "withdraw" && guard.isReporter !== true) return { ok: false, code: "OFFICE_ROLE_REQUIRED" };
  if (action === "monitor" && !hasText(guard.note)) return { ok: false, code: "VALIDATION_FAILED" };
  if ((action === "dismiss" || action === "withdraw") && !hasText(guard.reason)) {
    return { ok: false, code: "VALIDATION_FAILED" };
  }

  return { ok: true, to: transition.to };
}
