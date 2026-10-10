import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { suggestTechnicians } from "./suggest";
import { createSeededDb, ctxOf, ORG_A, PEOPLE, seedUuid, type SeededDb } from "./testing/seeded";

let db: SeededDb;
let savedRedisUrl: string | undefined;
const admin = ctxOf(PEOPLE.admin, "ADMIN");
const ENGINE_REPORT = seedUuid(1015);

beforeAll(async () => {
  savedRedisUrl = process.env.REDIS_URL;
  db = await createSeededDb("t10_suggest");
  const now = Date.now();
  // Two pings for Carlos: only the newest one, right next to the report, may be used.
  await db.raw("location_pings").insertMany([
    { _id: randomUUID(), organizationId: ORG_A, userId: PEOPLE.carlos, recordedAt: new Date(now - 60 * 60_000), receivedAt: new Date(now - 60 * 60_000), lat: -10, lng: -60 },
    { _id: randomUUID(), organizationId: ORG_A, userId: PEOPLE.carlos, recordedAt: new Date(now - 60_000), receivedAt: new Date(now - 60_000), lat: -21.1, lng: -47.8, accuracyM: 8 },
  ]);
}, 60_000);

afterAll(async () => {
  if (savedRedisUrl === undefined) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = savedRedisUrl;
  await db.close();
});

function carlosOf(items: readonly { userId: string; online: boolean; distanceKm: number | null }[]) {
  return items.find((item) => item.userId === PEOPLE.carlos);
}

describe("technician suggestions without live Redis fixes", () => {
  it("falls back to the newest location_pings row when REDIS_URL is unset", async () => {
    delete process.env.REDIS_URL;
    const result = await db.run((tx) => suggestTechnicians(tx, admin, { fieldReportId: ENGINE_REPORT }));
    expect(result.items.length).toBeGreaterThan(0);
    const carlos = carlosOf(result.items);
    expect(carlos?.online).toBe(true);
    expect(carlos?.distanceKm).not.toBeNull();
    expect(carlos?.distanceKm ?? Infinity).toBeLessThan(100);
  });

  it("falls back when the live lookup rejects", async () => {
    const result = await db.run((tx) =>
      suggestTechnicians(tx, admin, { fieldReportId: ENGINE_REPORT }, { lastFixes: async () => Promise.reject(new Error("ECONNREFUSED")) }),
    );
    expect(carlosOf(result.items)?.online).toBe(true);
  });

  it("falls back when the live lookup hangs past the timeout", async () => {
    const started = Date.now();
    const result = await db.run((tx) =>
      suggestTechnicians(tx, admin, { fieldReportId: ENGINE_REPORT }, { lastFixes: () => new Promise(() => undefined), liveFixTimeoutMs: 50 }),
    );
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(carlosOf(result.items)?.online).toBe(true);
  });

  it("still prefers the live fix when Redis answers", async () => {
    const result = await db.run((tx) =>
      suggestTechnicians(tx, admin, { fieldReportId: ENGINE_REPORT }, {
        lastFixes: async () => new Map([[PEOPLE.carlos, { userId: PEOPLE.carlos, lat: -10, lng: -60, recordedAt: new Date(Date.now() - 2 * 60 * 60_000) }]]),
      }),
    );
    const carlos = carlosOf(result.items);
    expect(carlos?.online ?? false).toBe(false);
  });
});
