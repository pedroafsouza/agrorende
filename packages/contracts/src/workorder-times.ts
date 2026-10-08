import type { WorkOrderStatus } from "./enums";

export interface WorkOrderStatusEvent {
  occurredAt: Date;
  toStatus: WorkOrderStatus;
}

export interface WorkOrderTimes {
  travelMinutes: number;
  workMinutes: number;
}

const MINUTE_MS = 60_000;

export function computeWorkOrderTimes(events: readonly WorkOrderStatusEvent[]): WorkOrderTimes {
  const ordered = [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  let travelMs = 0;
  let workMs = 0;

  for (let index = 0; index < ordered.length - 1; index += 1) {
    const event = ordered[index];
    const next = ordered[index + 1];
    if (event === undefined || next === undefined) continue;

    const durationMs = Math.max(0, next.occurredAt.getTime() - event.occurredAt.getTime());
    if (event.toStatus === "EN_ROUTE") travelMs += durationMs;
    if (event.toStatus === "IN_PROGRESS") workMs += durationMs;
  }

  return {
    travelMinutes: Math.round(travelMs / MINUTE_MS),
    workMinutes: Math.round(workMs / MINUTE_MS),
  };
}
