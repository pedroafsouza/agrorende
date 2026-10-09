import { dispatchClaimKey, type DispatchClaims, type DispatchClaimState } from "@agrorende/core/events";
import { describe, expect, it } from "vitest";

import { createEventOutboxDispatcher, type PushJobInput } from "./events.dispatch.js";
import type { Doc, WorkerCollection } from "./index.js";

const ORG = "0190f5a0-0000-7000-8000-00000000a001";

function fakeOutbox(rows: Doc[]): WorkerCollection {
  const unsupported = () => {
    throw new Error("unsupported");
  };
  return {
    find: (filter) => ({
      toArray: async () =>
        rows.filter((row) => row.dispatchedAt === null && (row.createdAt as Date) <= ((filter.createdAt as Doc).$lte as Date) && Number(row.attempts) < 20),
    }),
    updateOne: async (filter, update) => {
      const row = rows.find((candidate) => candidate._id === filter._id);
      if (row === undefined || ("dispatchedAt" in filter && row.dispatchedAt !== null)) return { matchedCount: 0, modifiedCount: 0 };
      Object.assign(row, (update.$set as Doc | undefined) ?? {});
      const inc = update.$inc as Doc | undefined;
      if (inc !== undefined) row.attempts = Number(row.attempts) + Number(inc.attempts);
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
  };
}

function row(id: string, createdAt: Date, payload: Doc): Doc {
  return { _id: id, organizationId: ORG, type: "notification:new", payload, createdAt, dispatchedAt: null, attempts: 0 };
}

describe("events.dispatch", () => {
  const now = new Date("2026-03-01T12:00:00Z");
  const old = new Date(now.getTime() - 60_000);

  it("publishes, enqueues push with jobId = event id and marks rows dispatched", async () => {
    const rows = [
      row("0190f5a0-0000-7000-8000-0000000e0001", old, { rooms: ["user:u1"], data: { id: "n1" }, pushNotificationIds: ["n1"] }),
      row("0190f5a0-0000-7000-8000-0000000e0002", now, { rooms: ["user:u2"], data: {} }),
    ];
    const published: unknown[] = [];
    const pushes: PushJobInput[] = [];
    const dispatcher = createEventOutboxDispatcher({ outbox: fakeOutbox(rows), publish: async (m) => void published.push(m), enqueuePush: async (p) => void pushes.push(p), enqueueAppleRevoke: async () => undefined });
    const result = await dispatcher.dispatchUndispatched({ olderThan: new Date(now.getTime() - 10_000), limit: 100 });
    expect(result).toEqual({ dispatched: 1, failed: 0 });
    expect(published).toEqual([{ eventId: rows[0]?._id, orgId: ORG, rooms: ["user:u1"], event: "notification:new", payload: { id: "n1" } }]);
    expect(pushes).toEqual([{ eventId: rows[0]?._id, orgId: ORG, notificationIds: ["n1"] }]);
    expect(rows[0]?.dispatchedAt).toBeInstanceOf(Date);
    expect(rows[1]?.dispatchedAt).toBeNull();
  });

  it("enqueues auth.appleRevoke for Apple identity deletion events without publishing", async () => {
    const rows: Doc[] = [{ ...row("0190f5a0-0000-7000-8000-0000000e0004", old, { rooms: [], data: { identityId: "id-1", userId: "u1" } }), type: "auth.appleRevoke" }];
    const published: unknown[] = [];
    const revokes: unknown[] = [];
    const dispatcher = createEventOutboxDispatcher({
      outbox: fakeOutbox(rows),
      publish: async (m) => void published.push(m),
      enqueuePush: async () => undefined,
      enqueueAppleRevoke: async (input) => void revokes.push(input),
    });
    expect(await dispatcher.dispatchUndispatched({ olderThan: now, limit: 10 })).toEqual({ dispatched: 1, failed: 0 });
    expect(published).toEqual([]);
    expect(revokes).toEqual([{ eventId: rows[0]?._id, orgId: ORG, identityId: "id-1" }]);
  });

  it("keeps a failed row undispatched and counts the attempt", async () => {
    const rows = [row("0190f5a0-0000-7000-8000-0000000e0003", old, { rooms: ["user:u1"], data: {} })];
    const dispatcher = createEventOutboxDispatcher({
      outbox: fakeOutbox(rows),
      publish: async () => {
        throw new Error("redis down");
      },
      enqueuePush: async () => undefined,
      enqueueAppleRevoke: async () => undefined,
    });
    expect(await dispatcher.dispatchUndispatched({ olderThan: now, limit: 10 })).toEqual({ dispatched: 0, failed: 1 });
    expect(rows[0]?.dispatchedAt).toBeNull();
    expect(rows[0]?.attempts).toBe(1);
    expect(rows[0]?.lastError).toBe("Error");
  });

  it("publishes each event once when two runs race on the same rows", async () => {
    const rows = [row("0190f5a0-0000-7000-8000-0000000e0005", old, { rooms: ["user:u1"], data: {}, pushNotificationIds: ["n5"] })];
    const published: unknown[] = [];
    const pushes: PushJobInput[] = [];
    const deps = { outbox: fakeOutbox(rows), publish: async (m: unknown) => void published.push(m), enqueuePush: async (p: PushJobInput) => void pushes.push(p), enqueueAppleRevoke: async () => undefined };
    const results = await Promise.all([
      createEventOutboxDispatcher(deps).dispatchUndispatched({ olderThan: now, limit: 10 }),
      createEventOutboxDispatcher(deps).dispatchUndispatched({ olderThan: now, limit: 10 }),
    ]);
    expect(published).toHaveLength(1);
    expect(pushes).toHaveLength(1);
    expect(results.reduce((sum, result) => sum + result.dispatched, 0)).toBe(1);
    expect(rows[0]?.dispatchedAt).toBeInstanceOf(Date);
  });

  it("uses core's claim key and only marks rows that core already published", async () => {
    const eventId = "0190f5a0-0000-7000-8000-0000000e0006";
    const rows = [row(eventId, old, { rooms: ["user:u1"], data: {} })];
    const keys: string[] = [];
    const states: Record<string, DispatchClaimState> = { [dispatchClaimKey("agrorende_t10_boundary", eventId)]: "done" };
    const claims: DispatchClaims = {
      acquire: async (key) => {
        keys.push(key);
        return { state: states[key] ?? "acquired", token: "lease:test" };
      },
      complete: async () => undefined,
      release: async () => undefined,
    };
    const published: unknown[] = [];
    const dispatcher = createEventOutboxDispatcher({
      outbox: fakeOutbox(rows),
      publish: async (m) => void published.push(m),
      enqueuePush: async () => undefined,
      enqueueAppleRevoke: async () => undefined,
      claims,
      dbName: "agrorende_t10_boundary",
    });
    expect(await dispatcher.dispatchUndispatched({ olderThan: now, limit: 10 })).toEqual({ dispatched: 1, failed: 0 });
    expect(keys).toEqual([dispatchClaimKey("agrorende_t10_boundary", eventId)]);
    expect(published).toEqual([]);
    expect(rows[0]?.dispatchedAt).toBeInstanceOf(Date);
  });

  it("skips a row while another process holds its lease", async () => {
    const rows = [row("0190f5a0-0000-7000-8000-0000000e0007", old, { rooms: ["user:u1"], data: {} })];
    const published: unknown[] = [];
    const claims: DispatchClaims = { acquire: async () => ({ state: "busy", token: "lease:test" }), complete: async () => undefined, release: async () => undefined };
    const dispatcher = createEventOutboxDispatcher({ outbox: fakeOutbox(rows), publish: async (m) => void published.push(m), enqueuePush: async () => undefined, enqueueAppleRevoke: async () => undefined, claims });
    expect(await dispatcher.dispatchUndispatched({ olderThan: now, limit: 10 })).toEqual({ dispatched: 0, failed: 0 });
    expect(published).toEqual([]);
    expect(rows[0]?.dispatchedAt).toBeNull();
  });
});
