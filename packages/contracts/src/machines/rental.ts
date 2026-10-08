import type { Role, RentalStatus } from "../enums";
import {
  checkRentalEligibility,
  validateCheckIn,
  validateCheckOut,
  type RentalEligibilityInput,
  type RentalErrorCode,
  type RentalValidationAsset,
  type RentalValidationInspection,
  type RentalValidationRental,
  type InspectionMedia,
} from "../charges";

export type RentalAction = "create" | "reserve" | "extend" | "checkOut" | "checkIn" | "updateCharges" | "close" | "cancel";
export type RentalTransitionErrorCode = RentalErrorCode | "OFFICE_ROLE_REQUIRED" | "VALIDATION_FAILED";

export interface RentalGuardInput {
  actorRole?: Role;
  reason?: string | null;
  hasOpenDamageDisputes?: boolean;
  eligibility?: RentalEligibilityInput;
  inspection?: RentalValidationInspection;
  media?: readonly InspectionMedia[];
  rental?: RentalValidationRental;
  asset?: RentalValidationAsset;
}

export type RentalTransitionResult =
  | { ok: true; to: RentalStatus }
  | { ok: false; code: RentalTransitionErrorCode; codes?: RentalErrorCode[] };

export const RENTAL_TRANSITIONS = {
  create: { from: [null], to: "DRAFT" },
  reserve: { from: ["DRAFT"], to: "RESERVED" },
  extend: { from: ["RESERVED", "ACTIVE"], to: null },
  checkOut: { from: ["RESERVED"], to: "ACTIVE" },
  checkIn: { from: ["ACTIVE"], to: "RETURNED" },
  updateCharges: { from: ["RETURNED"], to: "RETURNED" },
  close: { from: ["RETURNED"], to: "CLOSED" },
  cancel: { from: ["DRAFT", "RESERVED"], to: "CANCELLED" },
} as const satisfies Record<RentalAction, { from: readonly (RentalStatus | null)[]; to: RentalStatus | null }>;

function isOffice(role: Role | undefined): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

function hasText(value: string | null | undefined): boolean {
  return value !== undefined && value !== null && value.trim().length > 0;
}

export function canTransition(
  from: RentalStatus | null,
  action: RentalAction,
  guard: RentalGuardInput = {},
): RentalTransitionResult {
  const transition = RENTAL_TRANSITIONS[action];
  const fromStates: readonly (RentalStatus | null)[] = transition.from;
  if (!fromStates.includes(from)) return { ok: false, code: "INVALID_TRANSITION" };

  const officeAction = ["create", "reserve", "extend", "updateCharges", "close", "cancel"].includes(action);
  if (officeAction && !isOffice(guard.actorRole)) return { ok: false, code: "OFFICE_ROLE_REQUIRED" };

  if (action === "reserve") {
    if (guard.eligibility === undefined) return { ok: false, code: "VALIDATION_FAILED" };
    const result = checkRentalEligibility(guard.eligibility);
    if (!result.eligible) return { ok: false, code: result.codes[0] ?? "VALIDATION_FAILED", codes: result.codes };
  }
  if (action === "checkOut") {
    if (guard.inspection === undefined || guard.media === undefined || guard.rental === undefined || guard.asset === undefined) {
      return { ok: false, code: "GUARD_CHECKOUT_INCOMPLETE" };
    }
    const result = validateCheckOut(guard.inspection, guard.media, guard.rental, guard.asset);
    if (!result.ok) return result;
  }
  if (action === "checkIn") {
    if (guard.inspection === undefined || guard.media === undefined || guard.rental === undefined || guard.asset === undefined) {
      return { ok: false, code: "GUARD_CHECKIN_INCOMPLETE" };
    }
    const result = validateCheckIn(guard.inspection, guard.media, guard.rental, guard.asset);
    if (!result.ok) return result;
  }
  if (action === "close" && guard.hasOpenDamageDisputes === true) return { ok: false, code: "VALIDATION_FAILED" };
  if (action === "cancel" && !hasText(guard.reason)) return { ok: false, code: "VALIDATION_FAILED" };

  return { ok: true, to: transition.to ?? from ?? "DRAFT" };
}
