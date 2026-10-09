import { FuelLogCreatePayloadSchema } from "@agrorende/contracts/mutations";

import { buildFuelPayload, consumptionPerHour, listAssetFuelLogs, fuelTotalCents, newFuelDraft, priceToCents, validateFuelDraft } from "../../src/features/fuel/logic";
import { createSyncEngine } from "../../src/sync/engine";
import { listOutbox } from "../../src/sync/outbox";
import { createFuelLog } from "../../src/sync/mutators/fuel";
import { createTestRuntime, testId, USER_ID } from "../helpers/runtime";

describe("fuel form logic", () => {
  test("machine and litres are required, litres above zero, readings not negative", () => {
    expect(validateFuelDraft(newFuelDraft("f1"))).toEqual({ assetId: "fuel.errors.assetRequired", liters: "fuel.errors.litersRequired" });
    expect(validateFuelDraft({ ...newFuelDraft("f1", "a1"), liters: 0 })).toEqual({ liters: "fuel.errors.litersPositive" });
    expect(validateFuelDraft({ ...newFuelDraft("f1", "a1"), liters: 50, hourMeter: -1, odometerKm: -2, pricePerLiter: -3 })).toEqual({
      hourMeter: "fuel.errors.notNegative",
      odometerKm: "fuel.errors.notNegative",
      pricePerLiter: "fuel.errors.notNegative",
    });
    expect(validateFuelDraft({ ...newFuelDraft("f1", "a1"), liters: 120 })).toEqual({});
  });

  test("the payload converts reais to cents, trims notes and re-parents media", () => {
    const draft = {
      ...newFuelDraft("f2", "a1"),
      liters: 120,
      pricePerLiter: 6.19,
      hourMeter: 4312,
      notes: "  tanque cheio ",
      media: [{ id: "m1", kind: "PHOTO" as const, tag: "FUEL_PUMP", mimeType: "image/jpeg", parent: { type: "FUEL_LOG" as const, id: "other" }, localUri: "file:///x.jpg", capturedAt: "2026-03-01T12:00:00.000Z" }],
    };
    expect(priceToCents(6.19)).toBe(619);
    expect(fuelTotalCents(draft)).toBe(74280);
    const payload = buildFuelPayload(draft);
    expect(payload).toMatchObject({ id: "f2", assetId: "a1", liters: 120, pricePerLiterCents: 619, hourMeter: 4312, notes: "tanque cheio" });
    expect(payload.media[0]).not.toHaveProperty("localUri");
    expect(payload.media[0]?.parent).toEqual({ type: "FUEL_LOG", id: "f2" });
    expect(payload).not.toHaveProperty("odometerKm");
  });

  test("consumption follows the server rule: increasing readings only, litres of the later fill", () => {
    const at = (day: number) => `2026-03-0${day}T10:00:00.000Z`;
    expect(consumptionPerHour([{ id: "a", liters: 100, hourMeter: 100, filledAt: at(1) }])).toBeUndefined();
    expect(
      consumptionPerHour([
        { id: "a", liters: 100, hourMeter: 100, filledAt: at(1) },
        { id: "b", liters: 80, hourMeter: 110, filledAt: at(2) },
        { id: "c", liters: 50, hourMeter: 90, filledAt: at(3) },
        { id: "d", liters: 40, hourMeter: null, filledAt: at(4) },
        { id: "e", liters: 120, hourMeter: 130, filledAt: at(5) },
      ]),
    ).toEqual({ litersPerHour: 6.67, hours: 30, liters: 200 });
  });
});

describe("fuelLog.create mutator", () => {
  test("an offline fuel log shows on the machine at once and syncs exactly once", async () => {
    const { runtime, server } = await createTestRuntime();
    const assetId = testId();
    const id = testId();
    const payload = buildFuelPayload({ ...newFuelDraft(id, assetId), liters: 150, pricePerLiter: 6, hourMeter: 4400 });
    expect(FuelLogCreatePayloadSchema.safeParse(payload).success).toBe(true);
    await createFuelLog(payload, { runtime, lat: -15.6, lng: -47.7 });
    await createFuelLog(payload, { runtime });

    const local = await listAssetFuelLogs(runtime.db, assetId);
    expect(local).toEqual([expect.objectContaining({ id, liters: 150, totalCents: 90000, hourMeter: 4400, dirty: true })]);
    const outbox = await listOutbox(runtime.db);
    expect(outbox.map((row) => [row.name, row.entityId])).toEqual([
      ["fuelLog.create", id],
      ["fuelLog.create", id],
    ]);

    const engine = createSyncEngine(runtime, { media: async () => undefined });
    await engine.syncNow("manual");
    await engine.syncNow("manual");
    engine.dispose();
    const pushed = server.pushes.flatMap((push) => push.mutations).filter((m) => m.name === "fuelLog.create");
    expect(new Set(pushed.map((m) => m.id)).size).toBe(pushed.length);
    expect(new Set(pushed.map((m) => (m.payload as { id: string }).id))).toEqual(new Set([id]));
    expect(await listOutbox(runtime.db)).toHaveLength(0);
    expect((await listAssetFuelLogs(runtime.db, assetId))[0]?.dirty).toBe(false);
    expect(USER_ID).toBeTruthy();
  });
});
