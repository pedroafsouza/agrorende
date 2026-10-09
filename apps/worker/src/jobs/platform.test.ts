import { mkdir, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Redis } from "ioredis";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { checkWorkerHealth, createWorkerHealthServer } from "../health.js";
import { JOB_NAMES, JOB_REGISTRY } from "../jobRegistry.js";

import {
  createJobRuntime,
  DAY_MS,
  EXTRA_SCHEDULES,
  loadDbTesting,
  loadJobHandlers,
  loadWorkerPlatform,
  PEER_JOB_OWNERS,
  redactFields,
  runJob,
  type Doc,
  type JobHandler,
  type ObjectStore,
  type WorkerLogger,
  type WorkerPlatform,
  workerTable,
} from "./index.js";
import type { ExpoMessage, ExpoPushClient, ExpoReceipt, ExpoTicket } from "./notifications.push.js";

process.env.MONGODB_URI ??= "mongodb://localhost:27017/?replicaSet=rs0";
process.env.REDIS_URL ??= "redis://localhost:6379";

const DB_NAME = "agrorende_t05_worker";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const MEDIA_ROOT = path.resolve(REPO_ROOT, process.env.MEDIA_ROOT ?? ".data/media-t05", "worker-test");

const ORG = "0190f5a0-0000-7000-8000-00000000a001";
const ADMIN = "0190f5a0-0000-7000-8000-00000000b001";
const FIELD = "0190f5a0-0000-7000-8000-00000000b002";
const FIELD_2 = "0190f5a0-0000-7000-8000-00000000b003";
const DEVICE = "0190f5a0-0000-7000-8000-00000000c001";
const DEVICE_2 = "0190f5a0-0000-7000-8000-00000000c002";

interface TestDb {
  db: { databaseName: string };
  drop(): Promise<void>;
  truncate(): Promise<void>;
}

class FakeExpo implements ExpoPushClient {
  readonly sent: ExpoMessage[][] = [];
  failNext = false;
  unregisteredTokens = new Set<string>();
  receipts: Record<string, ExpoReceipt> = {};
  defaultReceipt: ExpoReceipt = { status: "ok" };
  private next = 0;

  async send(messages: readonly ExpoMessage[]): Promise<ExpoTicket[]> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("Expo push API responded 503");
    }
    this.sent.push([...messages]);
    return messages.map((message) =>
      this.unregisteredTokens.has(message.to) ? { status: "error", details: { error: "DeviceNotRegistered" } } : { status: "ok", id: `ticket-${(this.next += 1)}` },
    );
  }

  async getReceipts(ticketIds: readonly string[]): Promise<Record<string, ExpoReceipt>> {
    return Object.fromEntries(ticketIds.map((id) => [id, this.receipts[id] ?? this.defaultReceipt]));
  }
}

function memoryStore(): ObjectStore & { deleted: string[]; files: Map<string, Uint8Array> } {
  const deleted: string[] = [];
  const files = new Map<string, Uint8Array>();
  return {
    deleted,
    files,
    put: async (key, body) => void files.set(key, body),
    get: async (key) => {
      const body = files.get(key);
      if (body === undefined) throw new Error("missing");
      return body;
    },
    delete: async (key) => {
      deleted.push(key);
      files.delete(key);
    },
  };
}

function recordingLogger(): WorkerLogger & { lines: { level: string; event: string; fields?: Doc }[] } {
  const lines: { level: string; event: string; fields?: Doc }[] = [];
  return {
    lines,
    info: (event, fields) => void lines.push({ level: "info", event, fields }),
    warn: (event, fields) => void lines.push({ level: "warn", event, fields }),
    error: (event, fields) => void lines.push({ level: "error", event, fields }),
  };
}

let handle: TestDb;
let redis: Redis;
let platform: WorkerPlatform;
let handlers: Record<string, JobHandler>;
let expo: FakeExpo;
let store: ReturnType<typeof memoryStore>;
let logger: ReturnType<typeof recordingLogger>;
const appleRevoke = vi.fn<(input: { orgId: string; identityId: string }) => Promise<void>>();

function col(name: string) {
  return platform.table(name);
}

function run(name: string, data: Doc = {}, now = new Date(), attemptsMade = 0) {
  const handler = handlers[name];
  if (handler === undefined) throw new Error(`no handler ${name}`);
  return handler({ platform, logger, now }, { id: `${name}-test`, name, data, attemptsMade }) as Promise<Doc>;
}

function base(now: Date, extra: Doc = {}): Doc {
  return { organizationId: ORG, syncVersion: 1, createdAt: now, updatedAt: now, deletedAt: null, ...extra };
}

async function clearRedis(): Promise<void> {
  const keys = await redis.keys(`${platform.keyPrefix}:*`);
  if (keys.length > 0) await redis.del(...keys);
}

async function seedOrg(now: Date): Promise<void> {
  await col("organizations").insertOne({ _id: ORG, name: "Org", timezone: "America/Sao_Paulo", status: "ACTIVE", settings: { staleSyncAlertHours: 24 }, deletedAt: null });
  await col("sync_counters").updateOne({ _id: ORG }, { $setOnInsert: { value: 10, horizonVersion: 0 } }, { upsert: true });
  await workerTable(handle.db, "users").insertMany([
    base(now, { _id: ADMIN, name: "Alice", role: "ADMIN", locale: "pt-BR", isActive: true, dutyStatus: "OFF_DUTY" }),
    base(now, { _id: FIELD, name: "Bruno", role: "FIELD", locale: "pt-BR", isActive: true, dutyStatus: "ON_DUTY" }),
    base(now, { _id: FIELD_2, name: "Carla", role: "FIELD", locale: "en", isActive: true, dutyStatus: "OFF_DUTY" }),
  ]);
}

beforeAll(async () => {
  const testing = await loadDbTesting();
  handle = (await testing.setupTestDb(DB_NAME)) as unknown as TestDb;
  redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
  expo = new FakeExpo();
  store = memoryStore();
  logger = recordingLogger();
  platform = await loadWorkerPlatform({ dbName: DB_NAME, mediaRoot: MEDIA_ROOT, redis, expo, db: handle.db, store, appleRevoke, logger });
  handlers = await loadJobHandlers();
}, 60_000);

beforeEach(async () => {
  await handle.truncate();
  await clearRedis();
  await rm(MEDIA_ROOT, { recursive: true, force: true });
  expo.sent.length = 0;
  expo.unregisteredTokens.clear();
  expo.receipts = {};
  expo.defaultReceipt = { status: "ok" };
  logger.lines.length = 0;
  store.deleted.length = 0;
  appleRevoke.mockReset();
});

afterAll(async () => {
  await clearRedis();
  await rm(MEDIA_ROOT, { recursive: true, force: true });
  await handle.drop();
  await platform.close();
  redis.disconnect();
  const dbModule = await import("@agrorende/db");
  await dbModule.closeClient();
});

describe("job registry", () => {
  it("has a handler for every job and names the owner of each peer placeholder", async () => {
    expect(Object.keys(handlers).sort()).toEqual([...JOB_NAMES].sort());
    for (const [name, owner] of Object.entries(PEER_JOB_OWNERS)) {
      expect(JOB_NAMES).toContain(name);
      expect(owner).toMatch(/^T\d+|optional/u);
    }
  });

  it("loads every implemented peer job module instead of the no-op (change request T18-002)", async () => {
    const events = await import("./events.dispatch.js");
    const sla = await import("./workOrders.slaScan.js");
    const usage = await import("./usage.daily.js");
    expect(handlers["events.dispatch"]).toBe(events.handler);
    expect(handlers["workOrders.slaScan"]).toBe(sla.handler);
    expect(handlers["usage.daily"]).toBe(usage.handler);
  });

  it("namespaces Redis keys by MONGODB_DB", () => {
    expect(platform.keyPrefix).toContain(DB_NAME);
  });

  it("rejects unknown job names", async () => {
    await expect(runJob(handlers as never, { platform, logger }, { name: "nope", data: {} })).rejects.toThrow("Unknown worker job nope");
  });
});

describe("notifications.push", () => {
  async function seedPush(now: Date, count: number): Promise<string[]> {
    await seedOrg(now);
    await workerTable(handle.db, "devices").insertMany([
      base(now, { _id: DEVICE, userId: FIELD, pushStatus: "OK", pushToken: "ExponentPushToken[field]" }),
      base(now, { _id: DEVICE_2, userId: FIELD_2, pushStatus: "OK", pushToken: "ExponentPushToken[gone]" }),
    ]);
    const ids = Array.from({ length: count }, (_, index) => `0190f5a0-0000-7000-8000-${String(index).padStart(12, "0")}`);
    await workerTable(handle.db, "notifications").insertMany(
      ids.map((id, index) =>
        base(now, { _id: id, userId: index === 0 ? FIELD_2 : FIELD, type: "WORK_ORDER_ASSIGNED", title: "T", body: "B", pushedAt: null, readAt: null, entityType: "WORK_ORDER", entityId: "wo" }),
      ),
    );
    return ids;
  }

  it("sends in batches of 100, deactivates unregistered tokens and sends each notification once", async () => {
    const now = new Date();
    const ids = await seedPush(now, 250);
    expo.unregisteredTokens.add("ExponentPushToken[gone]");
    const first = await run("notifications.push", { notificationIds: ids }, now);
    expect(first).toMatchObject({ claimed: 250, sent: 249, batches: 3, deactivated: 1 });
    expect(expo.sent.map((batch) => batch.length)).toEqual([100, 100, 50]);
    expect(await col("devices").findOne({ _id: DEVICE_2 })).toMatchObject({ pushStatus: "TOKEN_INVALID", pushToken: null });
    const second = await run("notifications.push", { pushNotificationIds: ids }, now);
    expect(second).toMatchObject({ claimed: 0, sent: 0, batches: 0 });
    expect(expo.sent).toHaveLength(3);
    expect(logger.lines.some((line) => JSON.stringify(line).includes("ExponentPushToken"))).toBe(false);
  });

  it("releases claims when Expo fails so the retry sends them", async () => {
    const now = new Date();
    const ids = await seedPush(now, 3);
    expo.failNext = true;
    await expect(run("notifications.push", { notificationIds: ids }, now)).rejects.toThrow("503");
    expect(await col("notifications").countDocuments({ pushedAt: null })).toBe(3);
    expect(await run("notifications.push", {}, now)).toMatchObject({ claimed: 3, sent: 3 });
  });

  it("checks receipts after 15 minutes and deactivates DeviceNotRegistered", async () => {
    const now = new Date();
    const ids = await seedPush(now, 2);
    await run("notifications.push", { notificationIds: ids }, now);
    expo.defaultReceipt = { status: "error", details: { error: "DeviceNotRegistered" } };
    expect(await run("notifications.push", { receiptsOnly: true }, new Date(now.getTime() + 5 * 60_000))).toMatchObject({ receiptsChecked: 0 });
    const later = new Date(now.getTime() + 16 * 60_000);
    expect(await run("notifications.push", { receiptsOnly: true }, later)).toMatchObject({ receiptsChecked: 2 });
    expect((await col("devices").find({ pushStatus: "TOKEN_INVALID" }).toArray()).length).toBe(2);
    expect(await run("notifications.push", { receiptsOnly: true }, later)).toMatchObject({ receiptsChecked: 0 });
  });
});

describe("devices.staleSync", () => {
  it("alerts admins once per device per day", async () => {
    const now = new Date();
    await seedOrg(now);
    const old = new Date(now.getTime() - 30 * 3_600_000);
    await workerTable(handle.db, "devices").insertMany([
      base(old, { _id: DEVICE, userId: FIELD, lastSyncAt: old, pendingMutations: 0, oldestPendingAt: null, pushStatus: "OK", pushToken: null }),
      base(old, { _id: DEVICE_2, userId: FIELD_2, lastSyncAt: now, pendingMutations: 0, oldestPendingAt: null, pushStatus: "OK", pushToken: null }),
    ]);
    expect(await run("devices.staleSync", {}, now)).toMatchObject({ stale: 1, alerted: 1 });
    expect(await run("devices.staleSync", {}, now)).toMatchObject({ stale: 1, alerted: 0 });
    const rows = await col("notifications").find({ type: "DEVICE_STALE_SYNC" }).toArray();
    expect(rows.map((row) => [row.userId, row.entityId])).toEqual([[ADMIN, DEVICE]]);
    await col("devices").updateOne({ _id: DEVICE_2 }, { $set: { pendingMutations: 3, oldestPendingAt: old } });
    expect(await run("devices.staleSync", {}, now)).toMatchObject({ stale: 2, alerted: 1 });
  });
});

describe("media.cleanupPending", () => {
  it("reports pending media, fails stale uploads, purges soft-deleted objects and cleans MEDIA_ROOT", async () => {
    const now = new Date();
    await seedOrg(now);
    const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
    await workerTable(handle.db, "media").insertMany([
      base(hoursAgo(25), { _id: "m-pending", status: "PENDING", storageKey: "org/m-pending" }),
      base(hoursAgo(31 * 24), { _id: "m-stale", status: "PENDING", storageKey: "org/m-stale" }),
      base(hoursAgo(1), { _id: "m-fresh", status: "PENDING", storageKey: "org/m-fresh" }),
      base(hoursAgo(10 * 24), { _id: "m-deleted", status: "UPLOADED", storageKey: "org/m-deleted", thumbnailKey: "org/m-deleted-thumb", deletedAt: hoursAgo(8 * 24) }),
      base(hoursAgo(2 * 24), { _id: "m-recent-delete", status: "UPLOADED", storageKey: "org/m-recent", deletedAt: hoursAgo(24) }),
    ]);
    const oldTime = hoursAgo(30);
    await mkdir(path.join(MEDIA_ROOT, ".uploads", "old-session"), { recursive: true });
    await mkdir(path.join(MEDIA_ROOT, ".uploads", "new-session"), { recursive: true });
    await mkdir(path.join(MEDIA_ROOT, ".tmp"), { recursive: true });
    await writeFile(path.join(MEDIA_ROOT, ".uploads", "old-session", "part"), "x");
    await writeFile(path.join(MEDIA_ROOT, ".tmp", "old.bin"), "x");
    await writeFile(path.join(MEDIA_ROOT, ".tmp", "new.bin"), "x");
    await utimes(path.join(MEDIA_ROOT, ".uploads", "old-session"), oldTime, oldTime);
    await utimes(path.join(MEDIA_ROOT, ".tmp", "old.bin"), oldTime, oldTime);

    const first = await run("media.cleanupPending", {}, now);
    expect(first).toMatchObject({ markedFailed: 1, purged: 1 });
    expect(await col("media").findOne({ _id: "m-stale" })).toMatchObject({ status: "FAILED" });
    expect(((await col("media").findOne({ _id: "m-stale" })) as Doc).syncVersion).toBeGreaterThan(10);
    expect(await col("media").findOne({ _id: "m-deleted" })).toBeNull();
    expect(await col("media").findOne({ _id: "m-recent-delete" })).not.toBeNull();
    expect([...store.deleted].sort()).toEqual(["org/m-deleted", "org/m-deleted-thumb"]);
    expect(await readdir(path.join(MEDIA_ROOT, ".uploads"))).toEqual(["new-session"]);
    expect(await readdir(path.join(MEDIA_ROOT, ".tmp"))).toEqual(["new.bin"]);
    expect(logger.lines.find((line) => line.event === "attention.media_pending")?.fields).toMatchObject({ orgId: ORG, count: 1 });

    const second = await run("media.cleanupPending", {}, now);
    expect(second).toMatchObject({ markedFailed: 0, purged: 0 });
  });
});

describe("retention jobs", () => {
  it("prunes processed mutations with 30/90-day retention", async () => {
    const now = new Date();
    const at = (days: number) => new Date(now.getTime() - days * DAY_MS);
    await workerTable(handle.db, "processed_mutations").insertMany([
      { _id: "a-old", organizationId: ORG, result: { status: "APPLIED" }, processedAt: at(31) },
      { _id: "a-new", organizationId: ORG, result: { status: "APPLIED" }, processedAt: at(29) },
      { _id: "r-mid", organizationId: ORG, result: { status: "REJECTED" }, processedAt: at(60) },
      { _id: "r-old", organizationId: ORG, result: { status: "REJECTED" }, processedAt: at(91) },
    ]);
    expect(await run("mutations.prune", {}, now)).toEqual({ applied: 1, rejected: 1 });
    expect(await run("mutations.prune", {}, now)).toEqual({ applied: 0, rejected: 0 });
    expect((await col("processed_mutations").find({}).toArray()).map((row) => row._id).sort()).toEqual(["a-new", "r-mid"]);
  });

  it("prunes diagnostics after 30 days and trims oversized payloads idempotently", async () => {
    const now = new Date();
    const lines = Array.from({ length: 500 }, (_, index) => `line ${index} ${"x".repeat(1_000)}`);
    await workerTable(handle.db, "device_diagnostics").insertMany([
      { _id: "d-old", organizationId: ORG, deviceId: DEVICE, userId: FIELD, createdAt: new Date(now.getTime() - 31 * DAY_MS), appVersion: "1", payload: {} },
      { _id: "d-big", organizationId: ORG, deviceId: DEVICE, userId: FIELD, createdAt: now, appVersion: "1", payload: { appVersion: "1", logLines: lines } },
      { _id: "d-ok", organizationId: ORG, deviceId: DEVICE, userId: FIELD, createdAt: now, appVersion: "1", payload: { logLines: ["a"] } },
    ]);
    expect(await run("diagnostics.prune", {}, now)).toEqual({ deleted: 1, trimmed: 1 });
    expect(await run("diagnostics.prune", {}, now)).toEqual({ deleted: 0, trimmed: 0 });
    const big = (await col("device_diagnostics").findOne({ _id: "d-big" })) as Doc;
    const payload = big.payload as Doc;
    expect(payload).toMatchObject({ truncated: true, appVersion: "1" });
    expect((payload.logLines as string[]).at(-1)).toContain("line 499");
    expect(JSON.stringify(logger.lines)).not.toContain("line 499");
  });

  it("raises the sync horizon before deleting 90-day tombstones", async () => {
    const now = new Date();
    expect(platform.syncedCollections).toContain("assets");
    expect(platform.syncedCollections).not.toContain("processed_mutations");
    await col("sync_counters").updateOne({ _id: ORG }, { $set: { value: 50, horizonVersion: 3 } }, { upsert: true });
    await workerTable(handle.db, "assets").insertMany([
      base(now, { _id: "asset-old", syncVersion: 7, deletedAt: new Date(now.getTime() - 91 * DAY_MS), name: "old", code: "A-1" }),
      base(now, { _id: "asset-recent", syncVersion: 9, deletedAt: new Date(now.getTime() - 10 * DAY_MS), name: "recent", code: "A-2" }),
      base(now, { _id: "asset-live", syncVersion: 12, name: "live", code: "A-3" }),
    ]);
    expect(await run("tombstones.prune", {}, now)).toMatchObject({ deleted: 1, collections: { assets: 1 } });
    expect(await run("tombstones.prune", {}, now)).toMatchObject({ deleted: 0 });
    expect(await col("sync_counters").findOne({ _id: ORG })).toMatchObject({ value: 50, horizonVersion: 7 });
    expect((await col("assets").find({}).toArray()).map((row) => row._id).sort()).toEqual(["asset-live", "asset-recent"]);
  });

  it("runs the locations safety prune through the core module", async () => {
    const result = await run("locations.prune", {}, new Date());
    expect(result).toMatchObject({ deleted: 0 });
  });
});

describe("exports.build", () => {
  it("builds a queued export once and notifies once", async () => {
    const now = new Date();
    await seedOrg(now);
    const exportsModule = (await import("@agrorende/core/modules/exports")) as unknown as {
      createExportJob(ctx: Doc, input: Doc, deps: Doc): Promise<{ job: { id: string } }>;
    };
    const { job } = await exportsModule.createExportJob({ orgId: ORG, userId: ADMIN, role: "ADMIN", locale: "pt-BR" }, { entity: "assets" }, { db: handle.db, now });
    const first = await run("exports.build", { jobId: job.id }, now);
    const second = await run("exports.build", { jobId: job.id }, now);
    expect(first).toMatchObject({ built: 1, failed: 0 });
    expect(second).toMatchObject({ built: 0, failed: 0 });
    expect(store.files.size).toBe(1);
    expect(await col("notifications").countDocuments({ type: "EXPORT_READY", userId: ADMIN })).toBe(1);
  });
});

describe("auth.appleRevoke", () => {
  it("retries with a sanitized error and never logs the token", async () => {
    appleRevoke.mockRejectedValueOnce(new Error("invalid_grant for refresh token r.secret-refresh-token"));
    const data = { orgId: ORG, identityId: "identity-1" };
    await expect(run("auth.appleRevoke", data, new Date(), 0)).rejects.toThrow(/^APPLE_REVOKE_FAILED$/u);
    expect(JSON.stringify(logger.lines)).not.toContain("secret-refresh-token");
    expect(logger.lines.find((line) => line.event === "auth.appleRevoke.retry")?.fields).toMatchObject({ attempt: 1, errorName: "Error" });
    appleRevoke.mockResolvedValueOnce();
    await expect(run("auth.appleRevoke", data, new Date(), 1)).resolves.toBeDefined();
    expect(appleRevoke).toHaveBeenCalledTimes(2);
    expect(JOB_REGISTRY["auth.appleRevoke"]).toMatchObject({ attempts: 5, backoff: { type: "exponential" } });
  });

  it("drops malformed payloads without calling Apple or retrying", async () => {
    await expect(run("auth.appleRevoke", { orgId: ORG })).resolves.toEqual({ revoked: false });
    expect(logger.lines.find((line) => line.event === "auth.appleRevoke.invalid")).toBeDefined();
    expect(appleRevoke).not.toHaveBeenCalled();
  });
});

describe("runtime and health", () => {
  it("registers job schedulers idempotently under the database prefix", async () => {
    const runtime = createJobRuntime({ connection: redis, dbName: DB_NAME, handlers: handlers as never, platform, logger, consume: false });
    try {
      const ids = await runtime.schedule();
      await runtime.schedule();
      const expected = JOB_NAMES.filter((name) => "repeat" in JOB_REGISTRY[name]).length + EXTRA_SCHEDULES.length;
      expect(ids).toHaveLength(expected);
      let total = 0;
      for (const queue of Object.values(runtime.queues)) total += (await queue.getJobSchedulers()).length;
      expect(total).toBe(expected);
      expect(runtime.prefix).toContain(DB_NAME);
    } finally {
      for (const queue of Object.values(runtime.queues)) await queue.obliterate({ force: true });
      await runtime.stop();
    }
  }, 30_000);

  it("reports Redis and MEDIA_ROOT health", async () => {
    expect(await checkWorkerHealth(redis, MEDIA_ROOT)).toEqual({ ok: true, app: "agrorende", service: "worker", redis: "ok", media: "ok" });
    const brokenRedis = { ping: async () => Promise.reject(new Error("down")) } as unknown as Redis;
    expect(await checkWorkerHealth(brokenRedis, MEDIA_ROOT)).toMatchObject({ ok: false, redis: "error", media: "ok" });
    const blocker = path.join(MEDIA_ROOT, "file-root");
    await mkdir(MEDIA_ROOT, { recursive: true });
    await writeFile(blocker, "x");
    expect(await checkWorkerHealth(redis, blocker)).toMatchObject({ ok: false, media: "error" });

    const port = await new Promise<number>((resolve) => {
      const probe = createServer().listen(0, () => {
        const address = probe.address();
        probe.close(() => resolve(typeof address === "object" && address !== null ? address.port : 0));
      });
    });
    const server = createWorkerHealthServer(port, redis, MEDIA_ROOT);
    await server.start();
    try {
      const response = await fetch(`http://127.0.0.1:${server.port()}/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true, service: "worker" });
      expect((await fetch(`http://127.0.0.1:${server.port()}/nope`)).status).toBe(404);
    } finally {
      await server.stop();
    }
  });

  it("redacts token-like log fields", () => {
    expect(redactFields({ pushToken: "x", refreshToken: "y", orgId: ORG, lat: 1 })).toEqual({ pushToken: "[redacted]", refreshToken: "[redacted]", orgId: ORG, lat: "[redacted]" });
  });
});
