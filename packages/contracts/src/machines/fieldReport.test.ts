import { describe, expect, it } from "vitest";
import type { FieldReportStatus } from "../enums";
import { canTransition, FIELD_REPORT_TRANSITIONS, type FieldReportAction } from "./fieldReport";

const states: (FieldReportStatus | null)[] = [null, "SUBMITTED", "IN_REVIEW", "MARKED_FOR_REPAIR", "MONITORING", "DISMISSED"];
const actions = Object.keys(FIELD_REPORT_TRANSITIONS) as FieldReportAction[];
const guard = { actorRole: "MANAGER" as const, isReporter: true, note: "watch", reason: "done" };

describe("field report state machine", () => {
  it.each(actions.flatMap((action) => FIELD_REPORT_TRANSITIONS[action].from.map((from) => ({ action, from }))))(
    "allows $action from $from",
    ({ action, from }) => {
      const result = canTransition(from, action, guard);
      expect(result).toEqual({ ok: true, to: FIELD_REPORT_TRANSITIONS[action].to });
    },
  );

  it.each(
    actions.flatMap((action) =>
      states
        .filter((from) => !(FIELD_REPORT_TRANSITIONS[action].from as readonly (FieldReportStatus | null)[]).includes(from))
        .map((from) => ({ action, from })),
    ),
  )("forbids $action from $from", ({ action, from }) => {
    const result = canTransition(from, action, guard);
    expect(result.ok).toBe(false);
  });
});
