import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { loadDbTesting, workerTable, type Doc, type JobContext, type WorkerCollection, type WorkerLogger, type WorkerPlatform } from "./index.js";
import { isMuted, sendPendingPushes, type ExpoMessage, type ExpoPushClient, type ExpoTicket } from "./notifications.push.js";

process.env.MONGODB_URI ??= "mongodb://localhost:27017/?replicaSet=rs0";

/** Push mute settings (change request T05-008): muted users and muted types get no push. */

const DB_NAME = "agrorende_t10_schema_push";
const ORG = "0190f5a0-0000-7000-8000-00000000e001";
const LOUD = "0190f5a0-0000-7000-8000-00000000e101";
const MUTED = "0190f5a0-0000-7000-8000-00000000e102";
const PICKY = "0190f5a0-0000-7000-8000-00000000e103";

interface TestDb {
  db: unknown;
  drop(): Promise<void>;
  truncate(): Promise<void>;
}

const silent: WorkerLogger = { info: () => undefined, warn: () => undefined, error: () => undefined };

let handle: TestDb;
const sent: ExpoMessage[] = [];
const expo: ExpoPushClient = {
  async send(messages): Promise<ExpoTicket[]> {
    sent.push(...messages);
    return messages.map((_, index) => ({ status: "ok", id: `ticket-${sent.length}-${index}` }));
  },
  getReceipts: async () => ({}),
};

function ctx(now: Date): JobContext {
  const platform = {
    keyPrefix: `${DB_NAME}:test`,
    table: (name: string) => workerTable(handle.db, name),
    redis: { zadd: async () => 1 },
    expo,
  } as unknown as WorkerPlatform;
  return { platform, logger: silent, now };
}

function col(name: string): WorkerCollection {
  return workerTable(handle.db, name);
}

function base(now: Date, extra: Doc): Doc {
  return { organizationId: ORG, syncVersion: 1, createdAt: now, updatedAt: now, deletedAt: null, ...extra };
}

beforeAll(async () => {
  handle = (await (await loadDbTesting()).setupTestDb(DB_NAME)) as unknown as TestDb;
}, 60_000);

beforeEach(async () => {
  await handle.truncate();
  sent.length = 0;
});

afterAll(async () => {
  await handle.drop();
  await (await import("@agrorende/db")).closeClient();
});

describe("notifications.push mute settings", () => {
  it("decides from pushMuted and mutedTypes", () => {
    expect(isMuted(undefined, "WO_ASSIGNED")).toBe(false);
    expect(isMuted({ pushMuted: true, mutedTypes: [] }, "WO_ASSIGNED")).toBe(true);
    expect(isMuted({ pushMuted: false, mutedTypes: ["RENTAL_OVERDUE"] }, "RENTAL_OVERDUE")).toBe(true);
    expect(isMuted({ pushMuted: false, mutedTypes: ["RENTAL_OVERDUE"] }, "WO_ASSIGNED")).toBe(false);
  });

  it("skips muted users and muted types but keeps the in-app notifications", async () => {
    const now = new Date();
    await col("users").insertMany([
      base(now, { _id: LOUD, name: "Loud", role: "FIELD", isActive: true }),
      base(now, { _id: MUTED, name: "Muted", role: "FIELD", isActive: true, notificationPrefs: { pushMuted: true, mutedTypes: [] } }),
      base(now, { _id: PICKY, name: "Picky", role: "FIELD", isActive: true, notificationPrefs: { pushMuted: false, mutedTypes: ["RENTAL_OVERDUE"] } }),
    ]);
    await col("devices").insertMany(
      [LOUD, MUTED, PICKY].map((userId, index) => base(now, { _id: `0190f5a0-0000-7000-8000-00000000e20${index}`, userId, pushStatus: "OK", pushToken: `ExponentPushToken[${index}]` })),
    );
    const rows = [
      { userId: LOUD, type: "WO_ASSIGNED" },
      { userId: MUTED, type: "WO_ASSIGNED" },
      { userId: PICKY, type: "RENTAL_OVERDUE" },
      { userId: PICKY, type: "WO_ASSIGNED" },
    ].map((row, index) => base(now, { _id: `0190f5a0-0000-7000-8000-00000000e30${index}`, ...row, title: "T", body: "B", pushedAt: null, readAt: null }));
    await col("notifications").insertMany(rows);

    const summary = await sendPendingPushes(ctx(now), { notificationIds: rows.map((row) => String(row._id)) });
    expect(summary).toMatchObject({ claimed: 4, sent: 2 });
    expect(sent.map((message) => [message.to, message.data.type])).toEqual([
      ["ExponentPushToken[0]", "WO_ASSIGNED"],
      ["ExponentPushToken[2]", "WO_ASSIGNED"],
    ]);
    expect(await col("notifications").countDocuments({ deletedAt: null })).toBe(4);
    expect(await col("notifications").countDocuments({ pushedAt: null })).toBe(0);
  });
});
