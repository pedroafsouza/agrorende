import { describe, expect, it } from "vitest";

import { buildSeed } from "../seed/index";

const ACTIVE = new Set(["OPEN", "ASSIGNED", "ACCEPTED", "EN_ROUTE", "ON_SITE", "IN_PROGRESS", "ON_HOLD"]);

describe("demo seed (ARCHITECTURE §17)", () => {
  const bag = buildSeed();
  const users = new Map((bag.users ?? []).map((user) => [String(user._id), user]));
  const assetByCode = new Map((bag.assets ?? []).map((asset) => [String(asset.code), String(asset._id)]));

  it("assigns active work orders only to field users of the same organisation", () => {
    for (const workOrder of bag.work_orders ?? []) {
      if (workOrder.assigneeId === null) continue;
      const assignee = users.get(String(workOrder.assigneeId));
      expect(assignee?.organizationId, String(workOrder.number)).toBe(workOrder.organizationId);
      if (ACTIVE.has(String(workOrder.status))) {
        expect(assignee?.role, String(workOrder.number)).toBe("FIELD");
        expect(assignee?.joinedAt, String(workOrder.number)).not.toBeNull();
      }
    }
  });

  it("keeps Carlos at exactly one open work order, the ON_HOLD one", () => {
    const carlos = [...users.values()].find((user) => user.email === "tecnico1@agrorende.dev");
    const open = (bag.work_orders ?? []).filter((workOrder) => workOrder.assigneeId === carlos?._id && ACTIVE.has(String(workOrder.status)));
    expect(open.map((workOrder) => workOrder.status)).toEqual(["ON_HOLD"]);
  });

  it("leaves AGR-000012 without seeded field reports or work orders", () => {
    const tractor = assetByCode.get("AGR-000012");
    expect(tractor).toBeDefined();
    expect((bag.field_reports ?? []).filter((report) => report.assetId === tractor)).toEqual([]);
    expect((bag.work_orders ?? []).filter((workOrder) => workOrder.assetId === tractor)).toEqual([]);
  });
});
