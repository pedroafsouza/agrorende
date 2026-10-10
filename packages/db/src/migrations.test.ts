import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../migrations/runner";
import { closeClient } from "./client";
import { UserSchema } from "./schemas/index";
import { setupTestDb, type TestDbHandle } from "./testing/setupTestDb";

process.env.MONGODB_URI ??= "mongodb://localhost:27017/?replicaSet=rs0";

const ORG = "0190f5a0-0000-7000-8000-0000000d0001";
const OLD = "0190f5a0-0000-7000-8000-0000000d0101";
const MUTED = "0190f5a0-0000-7000-8000-0000000d0102";

let handle: TestDbHandle;

beforeAll(async () => {
  handle = await setupTestDb("agrorende_t10_schema_db");
}, 60_000);

afterAll(async () => {
  await handle.drop();
  await closeClient();
});

describe("user notification prefs (T05-008)", () => {
  const now = new Date("2026-10-08T12:00:00.000Z");
  const user = { _id: OLD, organizationId: ORG, syncVersion: 1, createdAt: now, updatedAt: now, name: "Ana" };

  it("parses users written before the field existed with the default", () => {
    expect(UserSchema.parse(user).notificationPrefs).toEqual({ pushMuted: false, mutedTypes: [] });
  });

  it("migration 0002-T05-008 backfills the default and keeps existing prefs", async () => {
    await handle.db.collection("users").insertMany([
      { ...user },
      { ...user, _id: MUTED, notificationPrefs: { pushMuted: true, mutedTypes: ["WO_ASSIGNED"] } },
    ] as never);
    const applied = await runMigrations(handle.db);
    expect(applied).toContain("0002-T05-008");
    const rows = await handle.db.collection("users").find({}, { sort: { _id: 1 } }).toArray();
    expect(rows.map((row) => row.notificationPrefs)).toEqual([
      { pushMuted: false, mutedTypes: [] },
      { pushMuted: true, mutedTypes: ["WO_ASSIGNED"] },
    ]);
    expect(await runMigrations(handle.db)).toEqual([]);
  });
});
