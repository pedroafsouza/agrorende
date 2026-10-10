import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { mutations } from "./mutations";
import { assetHistory, listAssets } from "./queries";
import { applyReadings, createAsset, deriveCondition, getSummary, listSummaries, recomputeCondition, retireAsset, setCustody, updateAsset } from "./service";
import { newId } from "./kit";
import { createHarness, OTHER_ORG_ID, type Harness } from "./testing/harness";

let h: Harness;

beforeAll(async () => {
  h = await createHarness("assets");
});

afterAll(async () => {
  await h.close();
});

async function seedAsset(): Promise<string> {
  const dto = await h.run((tx) => createAsset(tx, h.ctx, { name: "Trator 1", category: "TRACTOR", hourMeter: 100, odometerKm: 50 }));
  return dto.id;
}

function base(assetId: string, extra: Record<string, unknown>) {
  const now = new Date();
  return { _id: newId(), organizationId: h.ctx.orgId, syncVersion: 1, createdAt: now, updatedAt: now, deletedAt: null, assetId, ...extra };
}

describe("deriveCondition (ARCHITECTURE §6.4)", () => {
  const none = { hasRepairWorkOrder: false, hasOpenWorkOrder: false, hasBlockingReport: false, hasSevereDamage: false };
  it("rule 1 keeps manual states", () => {
    expect(deriveCondition("OUT_OF_SERVICE", { ...none, hasRepairWorkOrder: true })).toBe("OUT_OF_SERVICE");
    expect(deriveCondition("RETIRED", { ...none, hasOpenWorkOrder: true })).toBe("RETIRED");
  });
  it("rule 2 repair work wins", () => {
    expect(deriveCondition("OPERATIONAL", { ...none, hasRepairWorkOrder: true, hasOpenWorkOrder: true })).toBe("IN_REPAIR");
  });
  it("rule 3 open work, blocking reports or severe damage", () => {
    expect(deriveCondition("OPERATIONAL", { ...none, hasOpenWorkOrder: true })).toBe("NEEDS_REPAIR");
    expect(deriveCondition("OPERATIONAL", { ...none, hasBlockingReport: true })).toBe("NEEDS_REPAIR");
    expect(deriveCondition("OPERATIONAL", { ...none, hasSevereDamage: true })).toBe("NEEDS_REPAIR");
  });
  it("rule 4 otherwise operational", () => {
    expect(deriveCondition("IN_REPAIR", none)).toBe("OPERATIONAL");
  });
});

describe("assets core", () => {
  beforeEach(async () => {
    for (const name of ["assets", "work_orders", "field_reports", "damages", "activity_events"]) {
      await h.raw(name).deleteMany({});
    }
  });

  it("creates assets with an AGR code and returns a summary", async () => {
    const id = await seedAsset();
    const summary = await h.run((tx) => getSummary(tx, id));
    expect(summary.code).toMatch(/^AGR-\d{6}$/u);
    expect(summary.condition).toBe("OPERATIONAL");
    expect(summary.hourMeter).toBe(100);
  });

  it("recomputes condition from work orders, reports and damages and records asset.conditionChanged", async () => {
    const id = await seedAsset();
    const wo = base(id, { number: "WO-000001", status: "OPEN", priority: "HIGH", title: "x", scheduledFor: null });
    await h.raw("work_orders").insertOne(wo);
    expect(await h.run((tx) => recomputeCondition(tx, id))).toBe("NEEDS_REPAIR");

    await h.raw("work_orders").updateOne({ _id: wo._id }, { $set: { status: "IN_PROGRESS" } });
    expect(await h.run((tx) => recomputeCondition(tx, id))).toBe("IN_REPAIR");

    await h.raw("work_orders").updateOne({ _id: wo._id }, { $set: { status: "COMPLETED" } });
    expect(await h.run((tx) => recomputeCondition(tx, id))).toBe("OPERATIONAL");

    await h.raw("field_reports").insertOne(base(id, { status: "SUBMITTED", machineOperable: true, priority: "CRITICAL" }));
    expect(await h.run((tx) => recomputeCondition(tx, id))).toBe("NEEDS_REPAIR");
    await h.raw("field_reports").deleteMany({});

    await h.raw("field_reports").insertOne(base(id, { status: "MONITORING", machineOperable: false, priority: "LOW" }));
    expect(await h.run((tx) => recomputeCondition(tx, id))).toBe("OPERATIONAL");

    await h.raw("damages").insertOne(base(id, { severity: "SEVERE", repairedAt: null }));
    expect(await h.run((tx) => recomputeCondition(tx, id))).toBe("NEEDS_REPAIR");

    const events = await h.raw("activity_events").find({ entityId: id, action: "asset.conditionChanged" }).sort({ occurredAt: 1 }).toArray();
    expect(events.map((event) => `${String(event.fromStatus)}>${String(event.toStatus)}`)).toEqual([
      "OPERATIONAL>NEEDS_REPAIR",
      "NEEDS_REPAIR>IN_REPAIR",
      "IN_REPAIR>OPERATIONAL",
      "OPERATIONAL>NEEDS_REPAIR",
      "NEEDS_REPAIR>OPERATIONAL",
      "OPERATIONAL>NEEDS_REPAIR",
    ]);
    expect(events.every((event) => event.entityType === "ASSET")).toBe(true);
  });

  it("does not record an event when the condition is unchanged and keeps manual states", async () => {
    const id = await seedAsset();
    await h.run((tx) => recomputeCondition(tx, id));
    expect(await h.raw("activity_events").countDocuments({ action: "asset.conditionChanged" })).toBe(0);
    await h.run((tx) => updateAsset(tx, h.ctx, id, { condition: "OUT_OF_SERVICE" }));
    await h.raw("work_orders").insertOne(base(id, { number: "WO-1", status: "IN_PROGRESS", priority: "LOW", title: "x", scheduledFor: null }));
    expect(await h.run((tx) => recomputeCondition(tx, id))).toBe("OUT_OF_SERVICE");
  });

  it("applies readings monotonically and resets the baseline when the meter was replaced", async () => {
    const id = await seedAsset();
    const lower = await h.run((tx) => applyReadings(tx, h.ctx, id, { hourMeter: 90, odometerKm: 60, source: { entityType: "ASSET", entityId: id } }));
    expect(lower.ignored).toEqual(["hourMeter"]);
    let summary = await h.run((tx) => getSummary(tx, id));
    expect(summary.hourMeter).toBe(100);
    expect(summary.odometerKm).toBe(60);

    await h.run((tx) => mutations["asset.updateReadings"].apply(tx, h.ctx, { assetId: id, hourMeter: 5, meterReplaced: true }, {
      mutationId: newId(), deviceId: newId(), occurredAt: new Date(), receivedAt: new Date(), clockSkewed: false,
    }));
    summary = await h.run((tx) => getSummary(tx, id));
    expect(summary.hourMeter).toBe(5);
    const replaced = await h.raw("activity_events").findOne({ entityId: id, action: "asset.meterReplaced" });
    expect(replaced).not.toBeNull();
  });

  it("never rejects a valid asset.updateReadings payload", async () => {
    const id = await seedAsset();
    const handler = mutations["asset.updateReadings"];
    expect(handler.rejectionCodes).toEqual([]);
    expect(handler.schema.safeParse({ assetId: id, hourMeter: 1 }).success).toBe(true);
    await expect(h.run((tx) => handler.apply(tx, h.ctx, { assetId: id, hourMeter: 1 }, {
      mutationId: newId(), deviceId: newId(), occurredAt: new Date(), receivedAt: new Date(), clockSkewed: false,
    }))).resolves.toEqual({});
  });

  it("sets custody and lists summaries scoped to the organisation", async () => {
    const id = await seedAsset();
    const rentalId = newId();
    await h.run((tx) => setCustody(tx, id, { currentRentalId: rentalId }));
    const [summary] = await h.run((tx) => listSummaries(tx, h.ctx.orgId, { ids: [id] }));
    expect(summary?.currentRentalId).toBe(rentalId);
    await expect(h.run((tx) => listSummaries(tx, OTHER_ORG_ID, {}))).rejects.toMatchObject({ code: "FORBIDDEN" });
    const other = await h.run((tx) => getSummary(tx, id).catch((error: unknown) => error), { ...h.ctx, orgId: OTHER_ORG_ID, organizationId: OTHER_ORG_ID });
    expect(other).toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects stale If-Match with CONFLICT and retires with history", async () => {
    const id = await seedAsset();
    await expect(h.run((tx) => updateAsset(tx, h.ctx, id, { name: "x" }, "1"))).rejects.toMatchObject({ code: "CONFLICT" });
    const current = await h.run((tx) => getSummary(tx, id));
    expect(current.name).toBe("Trator 1");
    await h.run((tx) => retireAsset(tx, h.ctx, id, { reason: "Vendido" }));
    const page = await listAssets(h.ctx, {});
    expect(page.items.find((item) => item.id === id)).toBeUndefined();
    const retired = await listAssets(h.ctx, { includeRetired: "true" });
    expect(retired.items.find((item) => item.id === id)?.condition).toBe("RETIRED");
    const history = await assetHistory(h.ctx, id);
    expect(history.items.map((item) => item.action)).toContain("asset.conditionChanged");
  });

  it("rejects duplicate codes with a field error", async () => {
    await h.run((tx) => createAsset(tx, h.ctx, { code: "T-1", name: "A", category: "TRUCK" }));
    await expect(h.run((tx) => createAsset(tx, h.ctx, { code: "T-1", name: "B", category: "TRUCK" }))).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      fieldErrors: [{ path: "code", code: "duplicate" }],
    });
  });
});
