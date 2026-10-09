import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { realtimeRedisChannel, type RedisRealtimeMessage } from "@agrorende/contracts/realtime";
import { closeClient, collection, getDb } from "@agrorende/db";
import { setupTestDb } from "@agrorende/db/testing";

import { dispatchClaimKey, dispatchPending, emit, type DomainEvent } from "../events/index.js";
import { closeJobQueues, jobQueuePrefix } from "../jobs/index.js";
import { closeLocationsRedis } from "../modules/locations/redis.js";
import { withSyncTx } from "../sync/withSyncTx.js";
import { makeTestCtx } from "../testing/ctx.js";

/**
 * T10.15 part 2 — `event_outbox` dispatch is idempotent: repeated and concurrent dispatches of the
 * same row publish on the database-aware realtime channel and enqueue `notifications.push` exactly
 * once per event id, against the real MongoDB replica set, Redis and BullMQ.
 */

const DB = "agrorende_t10_seams_outbox";
process.env.MONGODB_URI ??= "mongodb://localhost:27017/?directConnection=true";
process.env.MONGODB_DB = DB;
process.env.REDIS_URL ??= "redis://localhost:6379";

const ctx = makeTestCtx();
const channel = realtimeRedisChannel(DB);
const received: RedisRealtimeMessage[] = [];

let handle: Awaited<ReturnType<typeof setupTestDb>>;
let subscriber: Redis;
let admin: Redis;
let notifications: Queue;

async function emitOne(event: DomainEvent): Promise<string> {
  return withSyncTx(ctx, (tx) => emit(tx, event));
}

async function outboxRow(id: string): Promise<Record<string, unknown>> {
  const row = await collection(await getDb(DB), "event_outbox").findOne({ _id: id });
  expect(row).not.toBeNull();
  return row as unknown as Record<string, unknown>;
}

/** Waits until pub/sub delivery settles, so a late duplicate would be counted. */
async function settle(): Promise<void> {
  await admin.ping();
  await new Promise((resolve) => setTimeout(resolve, 150));
}

function messagesFor(eventId: string): RedisRealtimeMessage[] {
  return received.filter((message) => message.eventId === eventId);
}

async function notificationJobs(eventId: string): Promise<number> {
  const jobs = await notifications.getJobs(["waiting", "delayed", "active", "completed", "failed", "prioritized"]);
  return jobs.filter((job) => job.id === eventId).length;
}

beforeAll(async () => {
  handle = await setupTestDb(DB);
  await collection(await getDb(DB), "sync_counters").insertOne({ _id: ctx.orgId, value: 0 } as never);
  admin = new Redis(process.env.REDIS_URL ?? "", { maxRetriesPerRequest: null });
  subscriber = new Redis(process.env.REDIS_URL ?? "");
  subscriber.on("message", (from: string, message: string) => {
    if (from === channel) received.push(JSON.parse(message) as RedisRealtimeMessage);
  });
  await subscriber.subscribe(channel);
  notifications = new Queue("notifications", { connection: admin, prefix: jobQueuePrefix(DB) });
  await notifications.obliterate({ force: true });
}, 30_000);

afterAll(async () => {
  await notifications.obliterate({ force: true });
  await notifications.close();
  const keys = await admin.keys(`${dispatchClaimKey(DB, "")}*`);
  if (keys.length > 0) await admin.del(...keys);
  await subscriber.quit();
  await admin.quit();
  await closeJobQueues();
  await closeLocationsRedis();
  await handle.drop();
  await closeClient();
});

describe("event_outbox dispatch idempotency", () => {
  it("uses the database-aware channel name", () => {
    expect(channel).toBe(`agrorende:events:${DB}`);
    expect(realtimeRedisChannel("agrorende")).toBe("agrorende:events");
  });

  it("publishes and enqueues once when the same row is dispatched twice in sequence", async () => {
    const id = await emitOne({ type: "notification:new", rooms: [`user:${ctx.userId}`], data: { id: "n-seq" }, pushNotificationIds: ["n-seq"] });
    expect(await outboxRow(id)).toMatchObject({ dispatchedAt: null, attempts: 0 });

    expect(await dispatchPending([id])).toEqual({ dispatched: 1, failed: 0 });
    const first = (await outboxRow(id)).dispatchedAt;
    expect(first).toBeInstanceOf(Date);

    expect(await dispatchPending([id])).toEqual({ dispatched: 0, failed: 0 });
    await settle();

    expect(messagesFor(id)).toEqual([{ eventId: id, orgId: ctx.orgId, rooms: [`user:${ctx.userId}`], event: "notification:new", payload: { id: "n-seq" } }]);
    expect(await notificationJobs(id)).toBe(1);
    expect((await outboxRow(id)).dispatchedAt).toEqual(first);
  });

  it("publishes and enqueues once under concurrent dispatches of the same row", async () => {
    const id = await emitOne({ type: "notification:new", rooms: [`user:${ctx.userId}`], data: { id: "n-par" }, pushNotificationIds: ["n-par"] });

    const results = await Promise.all([dispatchPending([id]), dispatchPending([id]), dispatchPending([id]), dispatchPending([id])]);
    await settle();

    expect(results.reduce((sum, result) => sum + result.failed, 0)).toBe(0);
    expect(messagesFor(id)).toHaveLength(1);
    expect(await notificationJobs(id)).toBe(1);
    // Every caller either published or saw the finished claim; the row ends up dispatched exactly once.
    expect((await outboxRow(id)).dispatchedAt).toBeInstanceOf(Date);
    expect(results.reduce((sum, result) => sum + result.dispatched, 0)).toBeGreaterThanOrEqual(1);
  });

  it("marks a row whose publish already happened without publishing it again", async () => {
    const id = await emitOne({ type: "workOrder:changed", entity: { entityType: "WORK_ORDER", entityId: "wo-1" } });
    // A previous dispatcher published and crashed before setting `dispatchedAt`.
    await admin.set(dispatchClaimKey(DB, id), "done", "PX", 60_000);

    expect(await dispatchPending([id])).toEqual({ dispatched: 1, failed: 0 });
    await settle();
    expect(messagesFor(id)).toHaveLength(0);
    expect((await outboxRow(id)).dispatchedAt).toBeInstanceOf(Date);
  });

  it("counts a failed attempt, keeps the row pending and publishes once on retry", async () => {
    const id = await emitOne({ type: "notification:new", rooms: ["ops:x"], data: { id: "n-retry" } });
    const failing = await dispatchPending([id], {
      publish: async () => {
        throw new Error("redis down");
      },
    });
    expect(failing).toEqual({ dispatched: 0, failed: 1 });
    expect(await outboxRow(id)).toMatchObject({ dispatchedAt: null, attempts: 1, lastError: "Error" });

    const [a, b] = await Promise.all([dispatchPending([id]), dispatchPending([id])]);
    await settle();
    expect(a.failed + b.failed).toBe(0);
    expect(messagesFor(id)).toHaveLength(1);
    expect((await outboxRow(id)).dispatchedAt).toBeInstanceOf(Date);
  });

  it("dispatches the ids this process emitted when called without ids", async () => {
    const one = await emitOne({ type: "notification:new", rooms: ["ops:y"], data: { id: "n-1" } });
    const two = await emitOne({ type: "notification:new", rooms: ["ops:y"], data: { id: "n-2" } });
    await Promise.all([dispatchPending(), dispatchPending([one, two])]);
    await settle();
    expect(messagesFor(one)).toHaveLength(1);
    expect(messagesFor(two)).toHaveLength(1);
    expect(await collection(await getDb(DB), "event_outbox").countDocuments({ dispatchedAt: null })).toBe(0);
  });
});
