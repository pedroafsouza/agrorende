import { describe, expect, it } from "vitest";

import { dueSoonFilter, isDueSoon, isOverdue, overdueFilter } from "./overdue";

const NOW = new Date("2026-11-11T12:00:00.000Z");
const active = (plannedEnd: string) => ({ status: "ACTIVE" as const, plannedEnd: new Date(plannedEnd) });

describe("overdue", () => {
  it("is overdue only after the grace period", () => {
    expect(isOverdue(active("2026-11-11T09:00:00.000Z"), NOW, 2)).toBe(true);
    expect(isOverdue(active("2026-11-11T11:00:00.000Z"), NOW, 2)).toBe(false);
    expect(isOverdue({ status: "RETURNED", plannedEnd: new Date("2026-11-01T00:00:00.000Z") }, NOW, 2)).toBe(false);
  });

  it("is due soon inside the window and not once overdue", () => {
    expect(isDueSoon(active("2026-11-12T08:00:00.000Z"), NOW, 24, 2)).toBe(true);
    expect(isDueSoon(active("2026-11-13T08:00:00.000Z"), NOW, 24, 2)).toBe(false);
    expect(isDueSoon(active("2026-11-11T09:00:00.000Z"), NOW, 24, 2)).toBe(false);
  });

  it("builds matching Mongo filters", () => {
    expect(overdueFilter(NOW, 2)).toMatchObject({ status: "ACTIVE", plannedEnd: { $lt: new Date("2026-11-11T10:00:00.000Z") } });
    expect(dueSoonFilter(NOW, 24, 2)).toMatchObject({
      status: "ACTIVE",
      plannedEnd: { $gte: new Date("2026-11-11T10:00:00.000Z"), $lte: new Date("2026-11-12T12:00:00.000Z") },
    });
  });
});
