import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { type AppError } from "@agrorende/contracts/errors";
import type { FuelLogCreatePayload } from "@agrorende/contracts/mutations";

import { makeTestCtx } from "../../testing/ctx.js";
import { createAsset } from "../assets/service.js";
import { newId } from "../assets/kit.js";
import { ADMIN_ID, AGENT_ID, createHarness, OTHER_ORG_ID, type Harness } from "../rentals/testing/harness.js";
import { mutations } from "./mutations.js";
import { computeConsumption, createFuelLog, createFuelLogOffice, fuelConsumption, listFuelLogs } from "./service.js";

let h: Harness;
const admin = makeTestCtx({ userId: ADMIN_ID, role: "ADMIN" });
const field = makeTestCtx({ userId: AGENT_ID, role: "FIELD" });
let assetId: string;
let seasonId: string;
let siteId: string;

beforeAll(async () => {
  h = await createHarness("fuel", "agrorende_t15");
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  for (const name of ["assets", "fuel_logs", "media", "seasons", "sites", "activity_events", "event_outbox", "number_sequences"]) {
    await h.raw(name).deleteMany({});
  }
  const now = new Date();
  seasonId = newId();
  siteId = newId();
  await h.raw("seasons").insertOne({ _id: seasonId, organizationId: admin.orgId, syncVersion: 1, createdAt: now, updatedAt: now, deletedAt: null, name: "Safra 26/27", isCurrent: true, startsAt: now, endsAt: now });
  const asset = await h.run((tx) => createAsset(tx, admin, { name: "Trator 7225J", category: "TRACTOR", hourMeter: 990 }));
  assetId = asset.id;
  await h.raw("assets").updateOne({ _id: assetId }, { $set: { currentSiteId: siteId } });
});

function payload(extra: Partial<FuelLogCreatePayload> = {}): FuelLogCreatePayload {
  return { id: newId(), assetId, liters: 100, pricePerLiterCents: 620, media: [], ...extra } as FuelLogCreatePayload;
}

const at = (iso: string) => ({ occurredAt: new Date(iso) });

describe("fuelLog.create (ERP-07, OFF-01)", () => {
  it("fills the current season and the asset's site, prices the fill-up and moves the hour meter", async () => {
    const log = await h.run((tx) => createFuelLog(tx, field, payload({ hourMeter: 1_000 }), at("2026-10-01T10:00:00Z")), field);
    expect(log).toMatchObject({ assetId, liters: 100, totalCents: 62_000, seasonId, siteId, operatorId: AGENT_ID, hourMeter: 1_000 });
    expect((await h.raw("assets").findOne({ _id: assetId }))?.hourMeter).toBe(1_000);
  });

  it("is idempotent on the log id", async () => {
    const p = payload();
    await h.run((tx) => createFuelLog(tx, field, p), field);
    await h.run((tx) => createFuelLog(tx, field, p), field);
    expect(await h.raw("fuel_logs").countDocuments({})).toBe(1);
  });

  it("two logs at 1 000 h and 1 010 h with 150 L in the second → 15 L/h", async () => {
    await h.run((tx) => createFuelLog(tx, field, payload({ hourMeter: 1_000, liters: 100 }), at("2026-10-01T10:00:00Z")), field);
    await h.run((tx) => createFuelLog(tx, field, payload({ hourMeter: 1_010, liters: 150 }), at("2026-10-02T10:00:00Z")), field);
    const consumption = await fuelConsumption(admin, { assetId });
    expect(consumption.averageLitersPerHour).toBe(15);
    expect(consumption.points).toEqual([expect.objectContaining({ liters: 150, hours: 10, litersPerHour: 15 })]);
  });

  it("a log with a lower hour meter is kept but leaves the asset reading unchanged (monotonic)", async () => {
    await h.run((tx) => createFuelLog(tx, field, payload({ hourMeter: 1_010 }), at("2026-10-01T10:00:00Z")), field);
    const lower = await h.run((tx) => createFuelLog(tx, field, payload({ hourMeter: 1_005, liters: 40 }), at("2026-10-02T10:00:00Z")), field);
    expect(lower.hourMeter).toBe(1_005);
    expect((await h.raw("assets").findOne({ _id: assetId }))?.hourMeter).toBe(1_010);
    const activity = await h.raw("activity_events").findOne({ entityId: lower.id, action: "fuelLog.created" });
    expect(activity?.meta).toMatchObject({ ignoredReadings: ["hourMeter"] });
    expect((await fuelConsumption(admin, { assetId })).points).toHaveLength(0);
  });

  it("registers the pump photo under the fuel log", async () => {
    const id = newId();
    const mediaId = newId();
    await h.run(
      (tx) =>
        createFuelLog(
          tx,
          field,
          payload({
            id,
            media: [{ id: mediaId, kind: "PHOTO", tag: "FUEL_PUMP", mimeType: "image/jpeg", sizeBytes: 1_000, capturedAt: new Date().toISOString(), parent: { type: "FUEL_LOG", id } }],
          } as Partial<FuelLogCreatePayload>),
        ),
      field,
    );
    expect(await h.raw("media").findOne({ _id: mediaId })).toMatchObject({ parent: { type: "FUEL_LOG", id } });
  });

  it("rejects an unknown asset with NOT_FOUND through the mutation handler", async () => {
    const handler = mutations["fuelLog.create"];
    const error = await h
      .run((tx) => handler.apply(tx as never, field, payload({ assetId: newId() }), { mutationId: newId(), deviceId: newId(), occurredAt: new Date(), receivedAt: new Date(), clockSkewed: false }), field)
      .catch((e: unknown) => e);
    expect((error as AppError).code).toBe("NOT_FOUND");
  });

  it("isolates organisations: another org cannot log fuel on this asset or read its logs (PLT-13)", async () => {
    await h.run((tx) => createFuelLog(tx, field, payload({ hourMeter: 1_000 }), at("2026-10-01T10:00:00Z")), field);
    const otherAdmin = makeTestCtx({ organizationId: OTHER_ORG_ID, userId: newId(), role: "ADMIN" });
    const otherField = makeTestCtx({ organizationId: OTHER_ORG_ID, userId: newId(), role: "FIELD" });
    const error = await h.run((tx) => createFuelLog(tx, otherField, payload(), at("2026-10-02T10:00:00Z")), otherField).catch((e: unknown) => e);
    expect((error as AppError).code).toBe("NOT_FOUND");
    expect((await listFuelLogs(otherAdmin)).items).toHaveLength(0);
    expect((await listFuelLogs(otherAdmin, { assetId })).items).toHaveLength(0);
    await expect(fuelConsumption(otherAdmin, { assetId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await listFuelLogs(admin, { assetId })).items).toHaveLength(1);
  });
});

describe("office fuel endpoints", () => {
  it("POST /fuel-logs accepts an office entry with an explicit filledAt", async () => {
    const log = await h.run((tx) => createFuelLogOffice(tx, admin, { assetId, liters: 50, pricePerLiterCents: 600, filledAt: "2026-09-30T12:00:00.000Z", media: [] }));
    expect(log).toMatchObject({ filledAt: "2026-09-30T12:00:00.000Z", totalCents: 30_000 });
  });

  it("GET /fuel-logs is office only, newest first and filterable", async () => {
    await h.run((tx) => createFuelLog(tx, field, payload(), at("2026-10-01T10:00:00Z")), field);
    await h.run((tx) => createFuelLog(tx, field, payload(), at("2026-10-03T10:00:00Z")), field);
    const page = await listFuelLogs(admin, { assetId });
    expect(page.items.map((item) => item.filledAt)).toEqual(["2026-10-03T10:00:00.000Z", "2026-10-01T10:00:00.000Z"]);
    expect((await listFuelLogs(admin, { from: "2026-10-02T00:00:00Z" })).items).toHaveLength(1);
    await expect(listFuelLogs(field, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(fuelConsumption(field, { assetId })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("computeConsumption", () => {
  it("skips logs without readings and averages litres over hours", () => {
    const result = computeConsumption("a", [
      { id: "1", liters: 80, hourMeter: 100, filledAt: "2026-01-01T00:00:00Z" },
      { id: "2", liters: 30, hourMeter: null, filledAt: "2026-01-02T00:00:00Z" },
      { id: "3", liters: 60, hourMeter: 104, filledAt: "2026-01-03T00:00:00Z" },
      { id: "4", liters: 90, hourMeter: 110, filledAt: "2026-01-04T00:00:00Z" },
    ]);
    expect(result.points.map((p) => p.litersPerHour)).toEqual([15, 15]);
    expect(result.averageLitersPerHour).toBe(15);
  });
});
