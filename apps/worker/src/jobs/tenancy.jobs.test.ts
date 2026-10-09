import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadDbTesting, workerTable, type Doc, type JobContext, type WorkerLogger, type WorkerPlatform } from "./index.js";
import { handler as lifecycleHandler } from "./orgs.lifecycle.js";
import { handler as purgeHandler } from "./orgs.purge.js";
import { handler as usageHandler } from "./usage.daily.js";

process.env.MONGODB_URI ??= "mongodb://localhost:27017/?replicaSet=rs0";
const DB_NAME = "agrorende_t20_worker";
process.env.MONGODB_DB = DB_NAME;
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const MEDIA_ROOT = path.resolve(REPO_ROOT, ".data/media-t20", "tenancy-jobs-test");
const DAY = 24 * 60 * 60 * 1000;

const TRIAL_DUE = "0190f5a0-0000-7000-8000-0000000f0001";
const TRIAL_OK = "0190f5a0-0000-7000-8000-0000000f0002";
const PAST_DUE_OLD = "0190f5a0-0000-7000-8000-0000000f0003";
const CANCELLED_DUE = "0190f5a0-0000-7000-8000-0000000f0004";
const CANCELLED_KEEP = "0190f5a0-0000-7000-8000-0000000f0005";

const NOW = new Date("2026-11-20T06:00:00Z");

interface TestHandle {
  db: unknown;
  drop(): Promise<void>;
}

let handle: TestHandle;
const silent: WorkerLogger = { info: () => undefined, warn: () => undefined, error: () => undefined } as unknown as WorkerLogger;

function ctx(): JobContext {
  return { platform: { dbName: DB_NAME, mediaRoot: MEDIA_ROOT } as unknown as WorkerPlatform, logger: silent, now: NOW };
}

function org(id: string, fields: Doc): Doc {
  return {
    _id: id,
    name: `Org ${id.slice(-2)}`,
    timezone: "America/Sao_Paulo",
    locale: "pt-BR",
    status: "TRIAL",
    plan: "trial",
    trialEndsAt: null,
    pastDueAt: null,
    suspendedAt: null,
    cancelledAt: null,
    purgeAfter: null,
    settings: {},
    syncVersion: 1,
    createdAt: new Date(NOW.getTime() - 60 * DAY),
    updatedAt: new Date(NOW.getTime() - 60 * DAY),
    ...fields,
  };
}

function user(id: string, organizationId: string, role: string): Doc {
  return { _id: id, organizationId, role, name: id, email: null, isActive: true, deletedAt: null, lastSeenAt: new Date(NOW.getTime() - DAY), syncVersion: 1, createdAt: NOW, updatedAt: NOW };
}

beforeAll(async () => {
  handle = (await (await loadDbTesting()).setupTestDb(DB_NAME)) as unknown as TestHandle;
  const ids = [TRIAL_DUE, TRIAL_OK, PAST_DUE_OLD, CANCELLED_DUE, CANCELLED_KEEP];
  await workerTable(handle.db, "organizations").insertMany([
    org(TRIAL_DUE, { trialEndsAt: new Date(NOW.getTime() - DAY) }),
    org(TRIAL_OK, { trialEndsAt: new Date(NOW.getTime() + DAY) }),
    org(PAST_DUE_OLD, { status: "PAST_DUE", pastDueAt: new Date(NOW.getTime() - 15 * DAY) }),
    org(CANCELLED_DUE, { status: "CANCELLED", cancelledAt: new Date(NOW.getTime() - 91 * DAY), purgeAfter: new Date(NOW.getTime() - DAY) }),
    org(CANCELLED_KEEP, { status: "CANCELLED", cancelledAt: new Date(NOW.getTime() - 30 * DAY), purgeAfter: new Date(NOW.getTime() + 60 * DAY) }),
  ]);
  await workerTable(handle.db, "sync_counters").insertMany(ids.map((id) => ({ _id: id, value: 1, horizonVersion: 0 })));
  await workerTable(handle.db, "users").insertMany([
    user("0190f5a0-0000-7000-8000-0000000e0001", TRIAL_OK, "ADMIN"),
    user("0190f5a0-0000-7000-8000-0000000e0002", TRIAL_OK, "FIELD"),
    user("0190f5a0-0000-7000-8000-0000000e0003", CANCELLED_DUE, "ADMIN"),
    user("0190f5a0-0000-7000-8000-0000000e0004", CANCELLED_KEEP, "ADMIN"),
  ]);
  await workerTable(handle.db, "assets").insertMany([
    { _id: "0190f5a0-0000-7000-8000-0000000d0001", organizationId: TRIAL_OK, deletedAt: null },
    { _id: "0190f5a0-0000-7000-8000-0000000d0002", organizationId: CANCELLED_DUE, deletedAt: null },
  ]);
  for (const id of [CANCELLED_DUE, CANCELLED_KEEP]) {
    const dir = path.join(MEDIA_ROOT, "org", id, "media", "2026", "08");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "photo.jpg"), "x");
  }
}, 60_000);

afterAll(async () => {
  await handle?.drop();
  const db = await import("@agrorende/db");
  await db.closeClient();
});

describe("T20 worker jobs", () => {
  it("usage.daily writes one row per organisation and month, isolated per tenant", async () => {
    await usageHandler(ctx(), { name: "usage.daily", data: {} });
    await usageHandler(ctx(), { name: "usage.daily", data: {} });
    const rows = await workerTable(handle.db, "org_usage").find({ organizationId: TRIAL_OK }).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ month: "2026-11-01", activeFieldUsers: 1, officeUsers: 1, assetCount: 1 });
    expect(await workerTable(handle.db, "org_usage").findOne({ organizationId: TRIAL_DUE })).toMatchObject({ activeFieldUsers: 0, officeUsers: 0, assetCount: 0 });
  });

  it("orgs.lifecycle moves expired trials to PAST_DUE and 14-day PAST_DUE to SUSPENDED", async () => {
    const result = await lifecycleHandler(ctx(), { name: "orgs.lifecycle", data: {} });
    expect(result).toEqual({ changed: 2 });
    expect((await workerTable(handle.db, "organizations").findOne({ _id: TRIAL_DUE }))?.status).toBe("PAST_DUE");
    expect((await workerTable(handle.db, "organizations").findOne({ _id: TRIAL_OK }))?.status).toBe("TRIAL");
    expect((await workerTable(handle.db, "organizations").findOne({ _id: PAST_DUE_OLD }))?.status).toBe("SUSPENDED");
    expect(await workerTable(handle.db, "event_outbox").countDocuments({ type: "org:status" })).toBe(2);
  });

  it("orgs.purge removes only CANCELLED organisations past purgeAfter, including their media", async () => {
    const result = await purgeHandler(ctx(), { name: "orgs.purge", data: {} });
    expect(result).toEqual({ purged: 1 });
    expect(await workerTable(handle.db, "organizations").findOne({ _id: CANCELLED_DUE })).toBeNull();
    expect(await workerTable(handle.db, "users").countDocuments({ organizationId: CANCELLED_DUE })).toBe(0);
    expect(await workerTable(handle.db, "assets").countDocuments({ organizationId: CANCELLED_DUE })).toBe(0);
    expect(await workerTable(handle.db, "organizations").findOne({ _id: CANCELLED_KEEP })).not.toBeNull();
    expect(await workerTable(handle.db, "users").countDocuments({ organizationId: CANCELLED_KEEP })).toBe(1);
    const folders = await readdir(path.join(MEDIA_ROOT, "org"));
    expect(folders).not.toContain(CANCELLED_DUE);
    expect(folders).toContain(CANCELLED_KEEP);
    expect(await workerTable(handle.db, "platform_audit_events").countDocuments({ organizationId: CANCELLED_DUE, action: "org.purge" })).toBe(1);
  });
});
