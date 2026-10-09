import { describe, expect, it } from "vitest";

import type { Doc, JobContext, NotifyInput, WorkerCollection, WorkerPlatform } from "./index.js";
import { handler } from "./rentals.overdueScan.js";

const ORG = "0190f5a0-0000-7000-8000-00000000a001";
const HOUR = 3_600_000;

function cmp(actual: unknown, op: string, expected: unknown): boolean {
  if (!(actual instanceof Date) || !(expected instanceof Date)) return false;
  const a = actual.getTime();
  const b = expected.getTime();
  if (op === "$lt") return a < b;
  if (op === "$lte") return a <= b;
  if (op === "$gt") return a > b;
  return a >= b;
}

function matches(row: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([key, value]) => {
    const actual = row[key];
    if (value !== null && typeof value === "object" && !(value instanceof Date)) {
      return Object.entries(value as Doc).every(([op, expected]) => {
        if (op === "$in") return (expected as unknown[]).includes(actual);
        if (op === "$nin") return !(expected as unknown[]).includes(actual);
        if (op === "$ne") return (actual ?? null) !== expected;
        return cmp(actual, op, expected);
      });
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
    findOne: async (filter) => rows.find((row) => matches(row, filter)) ?? null,
    updateOne: async (filter, update) => {
      const row = rows.find((candidate) => matches(candidate, filter));
      if (row === undefined) return { matchedCount: 0, modifiedCount: 0 };
      Object.assign(row, update.$set as Doc);
      return { matchedCount: 1, modifiedCount: 1 };
    },
    findOneAndUpdate: unsupported,
    insertOne: unsupported,
    insertMany: unsupported,
    updateMany: unsupported,
    deleteMany: unsupported,
    countDocuments: unsupported,
    aggregate: unsupported,
  } as WorkerCollection;
}

function setup(now: Date, settings: Doc = {}) {
  const rental = (id: string, extra: Doc): Doc => ({
    _id: id,
    organizationId: ORG,
    number: `RN-${id}`,
    assetId: "asset",
    agentId: "agent",
    status: "ACTIVE",
    dueSoonNotifiedAt: null,
    overdueNotifiedAt: null,
    deletedAt: null,
    ...extra,
  });
  const tables: Record<string, Doc[]> = {
    organizations: [{ _id: ORG, status: "ACTIVE", deletedAt: null, settings }],
    users: [
      { _id: "admin", organizationId: ORG, role: "ADMIN", isActive: true, deletedAt: null },
      { _id: "manager", organizationId: ORG, role: "MANAGER", isActive: true, deletedAt: null },
      { _id: "agent", organizationId: ORG, role: "FIELD", isActive: true, deletedAt: null },
    ],
    assets: [{ _id: "asset", organizationId: ORG, code: "TR-01" }],
    rentals: [
      rental("late", { plannedEnd: new Date(now.getTime() - 3 * HOUR) }),
      rental("grace", { plannedEnd: new Date(now.getTime() - HOUR) }),
      rental("soon", { plannedEnd: new Date(now.getTime() + 5 * HOUR) }),
      rental("far", { plannedEnd: new Date(now.getTime() + 100 * HOUR) }),
      rental("returned", { plannedEnd: new Date(now.getTime() - 10 * HOUR), status: "RETURNED" }),
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

const job = { name: "rentals.overdueScan", data: {} };

describe("rentals.overdueScan", () => {
  it("notifies overdue rentals past the grace window and due-soon rentals once", async () => {
    const now = new Date("2026-03-01T12:00:00Z");
    const { ctx, tables, notified } = setup(now);
    // "grace" is within the 2 h grace window, so it is still due soon rather than overdue.
    expect(await handler(ctx, job)).toEqual({ orgs: 1, dueSoon: 2, overdue: 1 });
    const overdue = notified.filter((n) => n.type === "RENTAL_OVERDUE").map((n) => n.entity.entityId);
    const dueSoon = notified.filter((n) => n.type === "RENTAL_DUE_SOON").map((n) => n.entity.entityId).sort();
    expect(overdue).toEqual(["late"]);
    expect(dueSoon).toEqual(["grace", "soon"]);
    expect(new Set(notified[0]?.userIds)).toEqual(new Set(["admin", "manager", "agent"]));
    expect(notified[0]?.params.title).toBe("RN-late · TR-01");
    const late = tables.rentals?.find((row) => row._id === "late");
    expect(late?.overdueNotifiedAt).toEqual(now);
    expect(late?.dueSoonNotifiedAt).toEqual(now);
    expect(late?.syncVersion).toBeGreaterThan(0);

    notified.length = 0;
    expect(await handler(ctx, job)).toEqual({ orgs: 1, dueSoon: 0, overdue: 0 });
    expect(notified).toHaveLength(0);
  });

  it("escalates a due-soon rental to overdue later and honours the organisation grace hours", async () => {
    const now = new Date("2026-03-01T12:00:00Z");
    const { ctx, notified } = setup(now, { rentalGraceHours: 0, rentalDueSoonHours: 1 });
    expect(await handler(ctx, job)).toEqual({ orgs: 1, dueSoon: 0, overdue: 2 });
    notified.length = 0;
    const later = { ...ctx, now: new Date(now.getTime() + 6 * HOUR) };
    expect(await handler(later, job)).toEqual({ orgs: 1, dueSoon: 0, overdue: 1 });
    expect(notified.map((n) => n.entity.entityId)).toEqual(["soon"]);
  });
});
