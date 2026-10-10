import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSeededDb, ctxOf, PEOPLE, seedUuid, type SeededDb } from "../workOrders/testing/seeded";
import { computeDuePoint, createPlan, due, listPlans, runDueScan, updatePlan, type PlanDoc } from "./service";

let db: SeededDb;
const admin = ctxOf(PEOPLE.admin, "ADMIN");
const carlos = ctxOf(PEOPLE.carlos, "FIELD");
const DAY_MS = 86_400_000;

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

beforeAll(async () => {
  db = await createSeededDb("t14_maintenance");
}, 60_000);

afterAll(async () => {
  await db.close();
});

const basePlan = (extra: Partial<PlanDoc>): PlanDoc => ({
  _id: "plan",
  syncVersion: 1,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  name: "Revisão",
  trigger: "HOURS",
  intervalHours: 250,
  leadHours: 25,
  leadDays: 7,
  ...extra,
});

describe("computeDuePoint", () => {
  const now = new Date("2026-06-01T00:00:00Z");

  it("adds the interval to the last service and flags the lead window", () => {
    const point = computeDuePoint(basePlan({}), 1_230, { at: null, hourMeter: 1_000 }, now);
    expect(point.nextDueHourMeter).toBe(1_250);
    expect(point.hoursRemaining).toBe(20);
    expect(point.isDue).toBe(true);
    expect(point.isOverdue).toBe(false);
    expect(computeDuePoint(basePlan({}), 1_200, { at: null, hourMeter: 1_000 }, now).isDue).toBe(false);
  });

  it("falls back to the next multiple of the interval without a baseline", () => {
    expect(computeDuePoint(basePlan({}), 1_230, { at: null, hourMeter: null }, now).nextDueHourMeter).toBe(1_250);
  });

  it("uses the calendar side for CALENDAR and either side for HOURS_OR_CALENDAR", () => {
    const calendar = basePlan({ trigger: "CALENDAR", intervalHours: null, intervalDays: 30 });
    const last = new Date(now.getTime() - 25 * DAY_MS);
    const point = computeDuePoint(calendar, 5_000, { at: last, hourMeter: null }, now);
    expect(point.nextDueHourMeter).toBeNull();
    expect(point.daysRemaining).toBe(5);
    expect(point.isDue).toBe(true);
    const either = basePlan({ trigger: "HOURS_OR_CALENDAR", intervalDays: 365 });
    expect(computeDuePoint(either, 1_300, { at: last, hourMeter: 1_000 }, now).isOverdue).toBe(true);
    expect(computeDuePoint(either, 1_010, { at: last, hourMeter: 1_000 }, now).isDue).toBe(false);
  });
});

describe("plans", () => {
  it("is office only and validates the target and intervals", async () => {
    expect(await codeOf(listPlans(carlos))).toBe("OFFICE_ROLE_REQUIRED");
    expect(await codeOf(db.run((tx) => createPlan(tx, carlos, { name: "x", assetId: seedUuid(430), trigger: "HOURS", intervalHours: 250 })))).toBe(
      "OFFICE_ROLE_REQUIRED",
    );
    expect(
      await codeOf(db.run((tx) => createPlan(tx, admin, { name: "x", assetId: seedUuid(430), assetCategory: "TRACTOR", trigger: "HOURS", intervalHours: 250 }))),
    ).toBe("VALIDATION_FAILED");
    expect(await codeOf(db.run((tx) => createPlan(tx, admin, { name: "x", assetId: seedUuid(430), trigger: "HOURS_OR_CALENDAR", intervalHours: 250 })))).toBe(
      "VALIDATION_FAILED",
    );
  });

  it("dueScan opens one preventive job and one notification per due asset, twice in a row", async () => {
    const assetId = seedUuid(430);
    const asset = await db.raw("assets").findOne({ _id: assetId });
    const hourMeter = (asset?.hourMeter as number | null) ?? 0;
    const plan = await db.run((tx) =>
      createPlan(tx, admin, { name: "Revisão 250 h", assetId, trigger: "HOURS", intervalHours: 250, lastDoneHourMeter: Math.max(0, hourMeter - 240), leadHours: 25 }),
    );
    expect(plan.nextDueHourMeter).toBe(Math.max(0, hourMeter - 240) + 250);
    const [row] = (await due(admin, plan.id)).items;
    expect(row?.isDue).toBe(true);

    const first = await db.run((tx) => runDueScan(tx, new Date()));
    const mine = first.created.filter((entry) => entry.planId === plan.id);
    expect(mine).toHaveLength(1);
    const workOrderId = mine[0]?.workOrderId ?? "";
    const wo = await db.raw("work_orders").findOne({ _id: workOrderId });
    expect(wo).toMatchObject({ type: "PREVENTIVE", status: "OPEN", maintenancePlanId: plan.id, assetId, createdById: null });
    const notified = await db.raw("notifications").countDocuments({ type: "MAINTENANCE_DUE", entityId: workOrderId });
    expect(notified).toBeGreaterThan(0);

    const second = await db.run((tx) => runDueScan(tx, new Date()));
    expect(second.created.filter((entry) => entry.planId === plan.id)).toHaveLength(0);
    expect(await db.raw("work_orders").countDocuments({ maintenancePlanId: plan.id })).toBe(1);
    expect(await db.raw("notifications").countDocuments({ type: "MAINTENANCE_DUE" })).toBe(notified);
    expect((await due(admin, plan.id)).items[0]?.hasOpen).toBe(true);
  });

  it("does not open a job for a plan that is not due, nor for an inactive plan", async () => {
    const assetId = seedUuid(431);
    const asset = await db.raw("assets").findOne({ _id: assetId });
    const hourMeter = (asset?.hourMeter as number | null) ?? 0;
    const plan = await db.run((tx) => createPlan(tx, admin, { name: "Revisão 500 h", assetId, trigger: "HOURS", intervalHours: 500, lastDoneHourMeter: hourMeter }));
    expect((await db.run((tx) => runDueScan(tx, new Date()))).created.filter((entry) => entry.planId === plan.id)).toHaveLength(0);
    const current = await db.raw("maintenance_plans").findOne({ _id: plan.id });
    const updated = await db.run((tx) => updatePlan(tx, admin, plan.id, { lastDoneHourMeter: Math.max(0, hourMeter - 499), isActive: false }, String(current?.syncVersion)));
    expect(updated.isActive).toBe(false);
    expect((await db.run((tx) => runDueScan(tx, new Date()))).created.filter((entry) => entry.planId === plan.id)).toHaveLength(0);
    expect((await listPlans(admin)).items.map((item) => item.id)).not.toContain(plan.id);
    expect((await listPlans(admin, { includeInactive: true })).items.map((item) => item.id)).toContain(plan.id);
  });

  it("needs If-Match to update a plan", async () => {
    const plan = await db.run((tx) => createPlan(tx, admin, { name: "Calendário", assetCategory: "GENERATOR", trigger: "CALENDAR", intervalDays: 180 }));
    expect(await codeOf(db.run((tx) => updatePlan(tx, admin, plan.id, { name: "Novo" }, "999")))).toBe("CONFLICT");
  });
});
