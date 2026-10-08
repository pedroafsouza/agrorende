import type { WorkOrderStatus } from "@agrorende/contracts/enums";
import type { OperatorState } from "@agrorende/contracts/realtime";

export const OFFLINE_AFTER_MS = 5 * 60 * 1000;

/** Work-order statuses that make a work order the operator's "active" one for the map. */
export const ACTIVE_WORK_ORDER_STATUSES = ["EN_ROUTE", "ON_SITE", "IN_PROGRESS", "ON_HOLD"] as const satisfies readonly WorkOrderStatus[];

/**
 * Operator state for the map (ARCHITECTURE §6.4).
 *
 * `socketOnline` is true when the operator's last presence ping is within the offline
 * window. A held work order maps to `ON_HOLD` (change request T05-003).
 */
export function deriveOperatorState(
  lastFixAt: Date | null,
  socketOnline: boolean,
  activeWoStatus: WorkOrderStatus | null,
  now: Date,
): OperatorState {
  const fixFresh = lastFixAt !== null && now.getTime() - lastFixAt.getTime() <= OFFLINE_AFTER_MS;
  if (!fixFresh && !socketOnline) {
    return "OFFLINE";
  }
  switch (activeWoStatus) {
    case "EN_ROUTE":
      return "EN_ROUTE";
    case "ON_SITE":
      return "ON_SITE";
    case "IN_PROGRESS":
      return "WORKING";
    case "ON_HOLD":
      return "ON_HOLD";
    default:
      return "IDLE";
  }
}
