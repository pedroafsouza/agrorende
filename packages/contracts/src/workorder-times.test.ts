import { describe, expect, it } from "vitest";
import { computeWorkOrderTimes } from "./workorder-times";

describe("computeWorkOrderTimes", () => {
  it("sums EN_ROUTE and IN_PROGRESS time and excludes ON_HOLD", () => {
    expect(
      computeWorkOrderTimes([
        { toStatus: "EN_ROUTE", occurredAt: new Date("2026-11-01T08:00:00.000Z") },
        { toStatus: "ON_SITE", occurredAt: new Date("2026-11-01T08:25:30.000Z") },
        { toStatus: "IN_PROGRESS", occurredAt: new Date("2026-11-01T08:30:00.000Z") },
        { toStatus: "ON_HOLD", occurredAt: new Date("2026-11-01T09:15:30.000Z") },
        { toStatus: "IN_PROGRESS", occurredAt: new Date("2026-11-01T10:00:00.000Z") },
        { toStatus: "COMPLETED", occurredAt: new Date("2026-11-01T10:30:00.000Z") },
      ]),
    ).toEqual({ travelMinutes: 26, workMinutes: 76 });
  });
});
