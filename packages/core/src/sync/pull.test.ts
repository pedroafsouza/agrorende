import { randomUUID } from "node:crypto";

import type { PullResponse, TableName } from "@agrorende/contracts/sync";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Ctx } from "../context.js";
import { createSeededDb, SEED, seedCtx, seedUuid, type SeededDb } from "../auth/testing/seeded.js";
import { decodeCursor, pull } from "./pull.js";

const DEVICE = "018fd000-0000-7000-8000-00000000d002";
const FIELD_104 = seedUuid(104);

type Collected = { changes: Partial<Record<TableName, Record<string, unknown>[]>>; deleted: Partial<Record<TableName, string[]>>; last: PullResponse; pages: number };

async function pullAll(ctx: Ctx, cursor?: string, scopeEpoch = 0): Promise<Collected> {
  const collected: Collected = { changes: {}, deleted: {}, last: undefined as unknown as PullResponse, pages: 0 };
  let next = cursor;
  for (let guard = 0; guard < 50; guard += 1) {
    const page = await pull(ctx, { deviceId: DEVICE, scopeEpoch, ...(next === undefined ? {} : { cursor: next }) });
    collected.pages += 1;
    collected.last = page;
    for (const [table, rows] of Object.entries(page.changes) as [TableName, Record<string, unknown>[]][]) {
      collected.changes[table] = [...(collected.changes[table] ?? []), ...rows];
    }
    for (const [table, ids] of Object.entries(page.deleted) as [TableName, string[]][]) {
      collected.deleted[table] = [...(collected.deleted[table] ?? []), ...ids];
    }
    next = page.cursor;
    if (!page.hasMore || page.resetRequired) return collected;
  }
  throw new Error("pull did not converge");
}

function idsOf(rows: Record<string, unknown>[] | undefined): Set<string> {
  return new Set((rows ?? []).map((row) => String(row.id)));
}

let seeded: SeededDb;

beforeAll(async () => {
  seeded = await createSeededDb("pull");
}, 60_000);

afterAll(async () => {
  await seeded.close();
});

describe("sync pull", () => {
  it("bootstraps in phases and scopes work orders for a field user", async () => {
    const first = await pull(seedCtx(FIELD_104, "FIELD"), { deviceId: DEVICE, scopeEpoch: 0 });
    expect(first.hasMore).toBe(true);
    expect(Object.keys(first.changes).sort()).toEqual(["organization", "users"]);
    expect(decodeCursor(first.cursor)?.phase).toBe(2);

    const all = await pullAll(seedCtx(FIELD_104, "FIELD"));
    const expected = await seeded
      .raw("work_orders")
      .find({ organizationId: SEED.orgA, $or: [{ assigneeId: FIELD_104 }, { previousAssigneeIds: FIELD_104 }] })
      .toArray();
    expect(idsOf(all.changes.workOrders)).toEqual(new Set(expected.map((doc) => doc._id)));
    const cursor = decodeCursor(all.last.cursor);
    expect(cursor?.phase).toBe(3);
    expect(cursor?.after).toBe(cursor?.snap);
    expect(all.last.hasMore).toBe(false);
  });

  it("redacts other users and never sends password hashes", async () => {
    const all = await pullAll(seedCtx(FIELD_104, "FIELD"));
    const users = all.changes.users ?? [];
    expect(users.every((row) => !("passwordHash" in row))).toBe(true);
    const self = users.find((row) => row.id === FIELD_104);
    const other = users.find((row) => row.id === SEED.admin);
    expect(self?.email).toBeDefined();
    expect(other?.email).toBeUndefined();
    expect(other?.hourlyCostCents).toBeUndefined();
    expect(users.some((row) => row.id === SEED.orgBUser)).toBe(false);
  });

  it("sends notification preferences only to their own user", async () => {
    const prefs = { pushMuted: true, mutedTypes: ["WO_ASSIGNED"] };
    await seeded.raw("users").updateMany({ _id: { $in: [FIELD_104, SEED.admin] } }, { $set: { notificationPrefs: prefs } });
    const users = (await pullAll(seedCtx(FIELD_104, "FIELD"))).changes.users ?? [];
    expect(users.find((row) => row.id === FIELD_104)?.notificationPrefs).toEqual(prefs);
    const other = users.find((row) => row.id === SEED.admin);
    expect(other).toBeDefined();
    expect(other).not.toHaveProperty("notificationPrefs");
  });

  it("returns only later changes in steady state", async () => {
    const ctx = seedCtx(SEED.manager, "MANAGER");
    const initial = await pullAll(ctx);
    const counter = await seeded.raw("sync_counters").findOne({ _id: SEED.orgA });
    const version = Number(counter?.value) + 1;
    await seeded.raw("sync_counters").updateOne({ _id: SEED.orgA }, { $set: { value: version } });
    const siteId = seedUuid(200);
    await seeded.raw("sites").updateOne({ _id: siteId }, { $set: { name: "Renamed", syncVersion: version } });
    const delta = await pullAll(ctx, initial.last.cursor);
    expect(delta.pages).toBe(1);
    expect(Object.keys(delta.changes)).toEqual(["sites"]);
    expect(delta.changes.sites?.[0]).toMatchObject({ id: siteId, name: "Renamed", syncVersion: String(version) });
  });

  it("sends tombstones in deleted", async () => {
    const ctx = seedCtx(SEED.manager, "MANAGER");
    const initial = await pullAll(ctx);
    const version = Number((await seeded.raw("sync_counters").findOne({ _id: SEED.orgA }))?.value) + 1;
    await seeded.raw("sync_counters").updateOne({ _id: SEED.orgA }, { $set: { value: version } });
    await seeded.raw("sites").updateOne({ _id: seedUuid(201) }, { $set: { deletedAt: new Date(), syncVersion: version } });
    const delta = await pullAll(ctx, initial.last.cursor);
    expect(delta.deleted.sites).toEqual([seedUuid(201)]);
  });

  it("pages large tables without losing rows that share a version", async () => {
    const ctx = seedCtx(SEED.admin, "ADMIN");
    const initial = await pullAll(ctx);
    const start = Number((await seeded.raw("sync_counters").findOne({ _id: SEED.orgA }))?.value);
    const now = new Date();
    const docs = Array.from({ length: 1500 }, (_, index) => ({
      _id: randomUUID(),
      organizationId: SEED.orgA,
      syncVersion: start + 1 + Math.floor(index / 3),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      name: `Bulk ${index}`,
      type: "FARM",
    }));
    await seeded.raw("sites").insertMany(docs);
    await seeded.raw("sync_counters").updateOne({ _id: SEED.orgA }, { $set: { value: start + 500 } });
    const delta = await pullAll(ctx, initial.last.cursor);
    expect(delta.pages).toBeGreaterThan(1);
    expect(idsOf(delta.changes.sites)).toEqual(new Set(docs.map((doc) => doc._id)));
  });

  it("requires a reset when the scope epoch changed or the cursor is invalid", async () => {
    const ctx = seedCtx(FIELD_104, "FIELD");
    const stale = await pull(ctx, { deviceId: DEVICE, scopeEpoch: 7 });
    expect(stale).toMatchObject({ resetRequired: true, scopeEpoch: 0 });
    const garbage = await pull(ctx, { deviceId: DEVICE, scopeEpoch: 0, cursor: "not-a-cursor" });
    expect(garbage.resetRequired).toBe(true);
  });

  it("masks customer tax ids for field users", async () => {
    const all = await pullAll(seedCtx(FIELD_104, "FIELD"));
    const customers = all.changes.customers ?? [];
    expect(customers.length).toBeGreaterThan(0);
    expect(customers.every((row) => !("taxId" in row))).toBe(true);
  });
});
