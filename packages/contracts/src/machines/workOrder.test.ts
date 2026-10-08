import { describe, expect, it } from "vitest";
import type { WorkOrderStatus } from "../enums";
import { canTransition, WORK_ORDER_TRANSITIONS, type WorkOrderAction } from "./workOrder";

const states: WorkOrderStatus[] = [
  "OPEN",
  "ASSIGNED",
  "ACCEPTED",
  "EN_ROUTE",
  "ON_SITE",
  "IN_PROGRESS",
  "ON_HOLD",
  "COMPLETED",
  "VERIFIED",
  "CANCELLED",
];
const actions = Object.keys(WORK_ORDER_TRANSITIONS) as WorkOrderAction[];
const guard = {
  actorRole: "MANAGER" as const,
  isAssignee: true,
  assigneeActiveAndJoined: true,
  holdReason: "WAITING_PARTS" as const,
  reason: "because",
  resolution: "fixed",
  afterPhotoCount: 1,
  checklistComplete: true,
  requireWoSignature: true,
  signatureStatus: "SIGNED" as const,
};

describe("work order state machine", () => {
  it.each(actions.flatMap((action) => WORK_ORDER_TRANSITIONS[action].from.map((from) => ({ action, from }))))(
    "allows $action from $from",
    ({ action, from }) => {
      const result = canTransition(from, action, guard);
      expect(result).toEqual({ ok: true, to: WORK_ORDER_TRANSITIONS[action].to });
    },
  );

  it.each(
    actions.flatMap((action) =>
      states
        .filter((from) => !(WORK_ORDER_TRANSITIONS[action].from as readonly WorkOrderStatus[]).includes(from))
        .map((from) => ({ action, from })),
    ),
  )("forbids $action from $from", ({ action, from }) => {
    const result = canTransition(from, action, guard);
    expect(result.ok).toBe(false);
  });

  it("requires office release for safety holds", () => {
    expect(canTransition("ON_HOLD", "resume", { isAssignee: true, currentHoldReason: "SAFETY" })).toEqual({
      ok: false,
      code: "OFFICE_ROLE_REQUIRED",
    });
    expect(canTransition("ON_HOLD", "resume", { actorRole: "ADMIN", currentHoldReason: "SAFETY" })).toEqual({
      ok: true,
      to: "IN_PROGRESS",
    });
  });
});
