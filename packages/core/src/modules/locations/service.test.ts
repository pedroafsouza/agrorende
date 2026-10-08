import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Redis } from "ioredis";
import { AppError } from "@agrorende/contracts/errors";
import { RedisRealtimeMessageSchema, realtimeRedisChannel } from "@agrorende/contracts/realtime";
import { closeClient, collections } from "@agrorende/db";
import { setupTestDb, type TestDbHandle } from "@agrorende/db/testing";

import { liveKey, presenceKey } from "./keys.js";
import { createPingWriter, ingest, lastFixes, liveSnapshot, pruneLocationPings, recordPresence } from "./service.js";
import { deriveOperatorState } from "./state.js";

const ORG = "0190f5a0-0000-7000-8000-00000000a001";
const OTHER_ORG = "0190f5a0-0000-7000-8000-00000000a002";
const ON_DUTY = "0190f5a0-0000-7000-8000-00000000b001";
const OFF_DUTY = "0190f5a0-0000-7000-8000-00000000b002";
const NOW = new Date("2026-10-08T12:00:00.000Z");

function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

function userDoc(id: string, orgId: string, dutyStatus: "ON_DUTY" | "OFF_DUTY", name: string) {
  return {
    _id: id,
    organizationId: orgId,
    syncVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    name,
    role: "FIELD",
    skills: [],
    locale: "pt-BR",
    isActive: true,
    mustChangePassword: false,
    dutyStatus,
    scopeEpoch: 0,
  } as never;
}

let handle: TestDbHandle;
let redis: Redis;

describe("locations module", () => {
  beforeAll(async () => {
    process.env.MONGODB_URI ??= "mongodb://localhost:27017/?directConnection=true";
    handle = await setupTestDb("agrorende_t05_locations");
    redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  });

  afterAll(async () => {
    await redis.quit();
    await handle.drop();
    await closeClient();
  });

  beforeEach(async () => {
    await handle.truncate();
    const dbName = handle.db.databaseName;
    await redis.del(liveKey(ORG, dbName), presenceKey(ORG, dbName), liveKey(OTHER_ORG, dbName));
    const keys = await redis.keys(`${dbName}:live-throttle:*`);
    if (keys.length > 0) await redis.del(...keys);
    await collections.users(handle.db).insertMany([
      userDoc(ON_DUTY, ORG, "ON_DUTY", "Ana"),
      userDoc(OFF_DUTY, ORG, "OFF_DUTY", "Bruno"),
    ]);
  });

  const deps = () => ({ db: handle.db, redis, now: NOW });

  it("drops every fix from an OFF_DUTY user", async () => {
    const result = await ingest({ orgId: ORG, userId: OFF_DUTY }, { fixes: [{ recordedAt: minutesAgo(1), lat: -23.5, lng: -46.6 }] }, deps());
    expect(result).toEqual({ accepted: 0, dropped: 1 });
    expect(await collections.locationPings(handle.db).countDocuments({})).toBe(0);
    expect(await redis.hlen(liveKey(ORG, handle.db.databaseName))).toBe(0);
  });

  it("rejects invalid payloads with VALIDATION_FAILED", async () => {
    await expect(ingest({ orgId: ORG, userId: ON_DUTY }, { fixes: [{ lat: 200, lng: 0 }] }, deps())).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    const tooMany = { fixes: Array.from({ length: 51 }, (_, index) => ({ recordedAt: minutesAgo(index + 1), lat: 0, lng: 0 })) };
    await expect(ingest({ orgId: ORG, userId: ON_DUTY }, tooMany, { ...deps(), maxFixes: 50 })).rejects.toBeInstanceOf(AppError);
  });

  it("inserts accepted pings, filters insane fixes and ignores duplicates", async () => {
    const payload = {
      fixes: [
        { recordedAt: minutesAgo(3), lat: -23.5, lng: -46.6, accuracyM: 12 },
        { recordedAt: minutesAgo(2), lat: -23.51, lng: -46.61, accuracyM: 900 },
        { recordedAt: minutesAgo(1), lat: -23.52, lng: -46.62, speedMps: 200 },
        { recordedAt: new Date(NOW.getTime() + 3_600_000).toISOString(), lat: -23.53, lng: -46.63 },
        { recordedAt: minutesAgo(1.5), lat: -23.54, lng: -46.64, speedMps: 8 },
      ],
    };
    const first = await ingest({ orgId: ORG, userId: ON_DUTY, deviceId: null }, payload, deps());
    expect(first).toEqual({ accepted: 2, dropped: 3 });
    const second = await ingest({ orgId: ORG, userId: ON_DUTY }, payload, deps());
    expect(second.accepted).toBe(2);
    const pings = await collections.locationPings(handle.db).find({ organizationId: ORG }).sort({ recordedAt: 1 }).toArray();
    expect(pings).toHaveLength(2);
    expect(pings.map((ping) => ping.lat)).toEqual([-23.5, -23.54]);
  });

  it("buffers rows through the ping writer", async () => {
    const writer = createPingWriter({ db: handle.db, flushMs: 60_000 });
    await ingest({ orgId: ORG, userId: ON_DUTY }, { fixes: [{ recordedAt: minutesAgo(1), lat: 1, lng: 2 }] }, { ...deps(), writer });
    expect(await collections.locationPings(handle.db).countDocuments({})).toBe(0);
    await writer.close();
    expect(await collections.locationPings(handle.db).countDocuments({})).toBe(1);
  });

  it("keeps only the newest fix in the live hash and throttles operator:location", async () => {
    const subscriber = redis.duplicate();
    const messages: unknown[] = [];
    await subscriber.subscribe(realtimeRedisChannel(handle.db.databaseName));
    subscriber.on("message", (_channel: string, raw: string) => messages.push(JSON.parse(raw) as unknown));
    try {
      await ingest({ orgId: ORG, userId: ON_DUTY }, { fixes: [{ recordedAt: minutesAgo(1), lat: 1, lng: 1 }] }, deps());
      await ingest({ orgId: ORG, userId: ON_DUTY }, { fixes: [{ recordedAt: minutesAgo(4), lat: 9, lng: 9 }] }, deps());
      await ingest({ orgId: ORG, userId: ON_DUTY }, { fixes: [{ recordedAt: minutesAgo(0.5), lat: 2, lng: 2 }] }, deps());
      await new Promise((resolve) => setTimeout(resolve, 100));
      const fixes = await lastFixes(ORG, [ON_DUTY], { redis, db: handle.db });
      expect(fixes.get(ON_DUTY)?.lat).toBe(2);
      expect(messages).toHaveLength(1);
      const message = RedisRealtimeMessageSchema.parse(messages[0]);
      expect(message.event).toBe("operator:location");
      expect(message.rooms).toEqual([`org:${ORG}:ops`]);
      expect(message.orgId).toBe(ORG);
    } finally {
      await subscriber.quit();
    }
  });

  it("falls back to the database when the live hash has no entry", async () => {
    await collections.locationPings(handle.db).insertMany([
      { _id: "0190f5a0-0000-7000-8000-00000000c001", organizationId: ORG, userId: OFF_DUTY, recordedAt: new Date(minutesAgo(30)), receivedAt: NOW, lat: 5, lng: 5 },
      { _id: "0190f5a0-0000-7000-8000-00000000c002", organizationId: ORG, userId: OFF_DUTY, recordedAt: new Date(minutesAgo(10)), receivedAt: NOW, lat: 6, lng: 6 },
      { _id: "0190f5a0-0000-7000-8000-00000000c003", organizationId: OTHER_ORG, userId: OFF_DUTY, recordedAt: new Date(minutesAgo(1)), receivedAt: NOW, lat: 7, lng: 7 },
    ]);
    const fixes = await lastFixes(ORG, [OFF_DUTY], { redis, db: handle.db });
    expect(fixes.get(OFF_DUTY)?.lat).toBe(6);
    expect(fixes.get(OFF_DUTY)?.recordedAt).toEqual(new Date(minutesAgo(10)));
  });

  it("derives the operator state in the live snapshot", async () => {
    await collections.workOrders(handle.db).insertOne({
      _id: "0190f5a0-0000-7000-8000-00000000d001",
      organizationId: ORG,
      syncVersion: 1,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
      number: "WO-000001",
      status: "EN_ROUTE",
      assigneeId: ON_DUTY,
    } as never);
    await ingest({ orgId: ORG, userId: ON_DUTY }, { fixes: [{ recordedAt: minutesAgo(1), lat: -23.5, lng: -46.6, heading: 90 }] }, deps());
    await recordPresence({ orgId: ORG, userId: ON_DUTY }, { online: true, publish: false }, deps());

    const snapshot = await liveSnapshot(ORG, deps());
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toMatchObject({ userId: ON_DUTY, name: "Ana", dutyStatus: "ON_DUTY", state: "EN_ROUTE", heading: 90 });

    const later = await liveSnapshot(ORG, { ...deps(), now: new Date(NOW.getTime() + 10 * 60_000) });
    expect(later[0]?.state).toBe("OFFLINE");
    expect(await liveSnapshot(OTHER_ORG, deps())).toEqual([]);
  });

  it("prunes old pings in chunks", async () => {
    const old = Array.from({ length: 25 }, (_, index) => ({
      _id: `0190f5a0-0000-7000-8000-${String(index).padStart(12, "0")}`,
      organizationId: ORG,
      userId: ON_DUTY,
      recordedAt: new Date(NOW.getTime() - (31 * 24 * 60 + index) * 60_000),
      receivedAt: NOW,
      lat: 0,
      lng: 0,
    }));
    await collections.locationPings(handle.db).insertMany([
      ...old,
      { _id: "0190f5a0-0000-7000-8000-00000000e999", organizationId: ORG, userId: ON_DUTY, recordedAt: new Date(minutesAgo(5)), receivedAt: NOW, lat: 0, lng: 0 },
    ]);
    const result = await pruneLocationPings({ db: handle.db, now: NOW, chunkSize: 10 });
    expect(result).toEqual({ deleted: 25, chunks: 3 });
    expect(await collections.locationPings(handle.db).countDocuments({})).toBe(1);
    expect(await pruneLocationPings({ db: handle.db, now: NOW, chunkSize: 10 })).toEqual({ deleted: 0, chunks: 0 });
  });
});

describe("deriveOperatorState", () => {
  it("follows ARCHITECTURE §6.4", () => {
    const fresh = new Date(NOW.getTime() - 60_000);
    const stale = new Date(NOW.getTime() - 6 * 60_000);
    expect(deriveOperatorState(stale, false, "IN_PROGRESS", NOW)).toBe("OFFLINE");
    expect(deriveOperatorState(null, true, "IN_PROGRESS", NOW)).toBe("WORKING");
    expect(deriveOperatorState(fresh, false, "ON_SITE", NOW)).toBe("ON_SITE");
    expect(deriveOperatorState(fresh, false, "EN_ROUTE", NOW)).toBe("EN_ROUTE");
    expect(deriveOperatorState(fresh, false, "ON_HOLD", NOW)).toBe("IDLE");
    expect(deriveOperatorState(fresh, false, null, NOW)).toBe("IDLE");
  });
});
