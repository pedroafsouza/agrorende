import { describe, expect, it } from "vitest";

import type { Doc, JobContext, NotifyInput, WorkerCollection, WorkerPlatform } from "./index.js";
import { handler } from "./workOrders.slaScan.js";

const ORG = "0190f5a0-0000-7000-8000-00000000a001";
const HOUR = 3_600_000;

function matches(row: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([key, value]) => {
    const actual = row[key];
    if (value !== null && typeof value === "object" && !(value instanceof Date)) {
      const op = value as Doc;
      if ("$in" in op) return (op.$in as unknown[]).includes(actual);
      if ("$nin" in op) return !(op.$nin as unknown[]).includes(actual);
      if ("$ne" in op) return (actual ?? null) !== op.$ne;
      return false;
    }
    return (actual ?? null) === value;
  });
}

function collection(rows: Doc[]): WorkerCollection {
  const unsupported = () => {
    throw new Error("unsupported");
  };
  return {
    find: (filter) => ({ toArray: async () => rows.filter((row) => matches(row, filter)) }),
    updateOne: async (filter, update) => {
      const row = rows.find((candidate) => matches(candidate, filter));
      if (row === undefined) return { matchedCount: 0, modifiedCount: 0 };
      Object.assign(row, update.$set as Doc);
      return { matchedCount: 1, modifiedCount: 1 };
    },
    findOne: unsupported,
    findOneAndUpdate: unsupported,
    insertOne: unsupported,
    insertMany: unsupported,
    updateMany: unsupported,
    deleteMany: unsupported,
    countDocuments: unsupported,
    aggregate: unsupported,
  } as WorkerCollection;
}

function setup(now: Date) {
  const created = new Date(now.getTime() - 20 * HOUR);
  const wo = (id: string, extra: Doc): Doc => ({
    _id: id,
    organizationId: ORG,
    number: `WO-${id}`,
    title: "Hydraulic leak",
    status: "ASSIGNED",
    priority: "HIGH",
    createdAt: created,
    assigneeId: "tech",
    slaAtRiskNotifiedAt: null,
    slaBreachedAt: null,
    deletedAt: null,
    ...extra,
  });
  const tables: Record<string, Doc[]> = {
    organizations: [{ _id: ORG, status: "ACTIVE", deletedAt: null, settings: {} }],
    users: [
      { _id: "admin", organizationId: ORG, role: "ADMIN", isActive: true, deletedAt: null },
      { _id: "tech", organizationId: ORG, role: "FIELD", isActive: true, deletedAt: null },
    ],
    work_orders: [
      wo("risk", { dueAt: new Date(created.getTime() + 24 * HOUR) }),
      wo("late", { dueAt: new Date(now.getTime() - HOUR) }),
      wo("fine", { dueAt: new Date(now.getTime() + 200 * HOUR), createdAt: now }),
      wo("done", { dueAt: new Date(now.getTime() - HOUR), status: "COMPLETED" }),
      wo("none", { dueAt: null }),
    ],
  };
  const notified: NotifyInput[] = [];
  let version = 0;
  const platform = {
    table: (name: string) => collection(tables[name] ?? []),
    notify: async (_orgId: string, input: NotifyInput) => void notified.push(input),
    nextSyncVersion: async () => ++version,
  } as unknown as WorkerPlatform;
  const ctx: JobContext = { platform, now, logger: { info: () => undefined, warn: () => undefined, error: () => undefined } };
  return { ctx, tables, notified };
}

describe("workOrders.slaScan", () => {
  it("notifies at-risk and breached jobs once and records the one-shot flags", async () => {
    const now = new Date("2026-03-01T12:00:00Z");
    const { ctx, tables, notified } = setup(now);
    expect(await handler(ctx, { name: "workOrders.slaScan", data: {} })).toEqual({ orgs: 1, atRisk: 1, breached: 1 });
    expect(notified.map((n) => n.entity.entityId).sort()).toEqual(["late", "risk"]);
    expect(notified[0]?.type).toBe("SLA_AT_RISK");
    expect(new Set(notified[0]?.userIds)).toEqual(new Set(["admin", "tech"]));
    const late = tables.work_orders?.find((row) => row._id === "late");
    expect(late?.slaBreachedAt).toEqual(now);
    expect(late?.syncVersion).toBeGreaterThan(0);

    notified.length = 0;
    expect(await handler(ctx, { name: "workOrders.slaScan", data: {} })).toEqual({ orgs: 1, atRisk: 0, breached: 0 });
    expect(notified).toHaveLength(0);
  });

  it("breaches a job that was already notified as at risk", async () => {
    const now = new Date("2026-03-01T12:00:00Z");
    const { ctx, tables } = setup(now);
    await handler(ctx, { name: "workOrders.slaScan", data: {} });
    const later = { ...ctx, now: new Date(now.getTime() + 10 * HOUR) };
    expect(await handler(later, { name: "workOrders.slaScan", data: {} })).toEqual({ orgs: 1, atRisk: 0, breached: 1 });
    expect(tables.work_orders?.find((row) => row._id === "risk")?.slaBreachedAt).toEqual(later.now);
  });
});
