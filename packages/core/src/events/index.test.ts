import { afterAll, describe, expect, it } from "vitest";
import { closeClient, collection, getDb, withSyncTx } from "@agrorende/db";
import { setupTestDb } from "@agrorende/db/testing";
import { realtimeRedisChannel } from "@agrorende/contracts/realtime";

import { recordActivity } from "../activity/index";
import type { SyncTx } from "../sync/types";
import { makeTestCtx } from "../testing/ctx";
import { dispatchPending, emit, pendingEventIds } from "./index";

const DB = "agrorende_w2gate_events";

describe("events.emit and dispatchPending", () => {
  afterAll(async () => {
    await closeClient();
  });

  it("writes outbox rows in the transaction and dispatches them after commit", async () => {
    process.env.MONGODB_URI ??= "mongodb://localhost:27017";
    process.env.MONGODB_DB = DB;
    const handle = await setupTestDb(DB);
    const ctx = makeTestCtx();
    try {
      const db = await getDb(DB);
      await collection(db, "sync_counters").insertOne({ _id: ctx.orgId, value: 0 } as never);

      const ids = await withSyncTx(ctx, async (dbTx) => {
        const tx = dbTx as unknown as SyncTx;
        await recordActivity(tx, { entityType: "ASSET", entityId: "asset-1", action: "asset.created", actorId: ctx.userId }, { publish: true });
        const pushId = await emit(tx, { type: "notification:new", rooms: ["user:u1"], data: { id: "n1" }, pushNotificationIds: ["n1"] });
        return { pushId };
      });

      const activity = await collection(db, "activity_events").find({ organizationId: ctx.orgId }).toArray();
      expect(activity).toHaveLength(1);
      expect(activity[0]?.action).toBe("asset.created");
      expect(pendingEventIds()).toHaveLength(2);

      const published: { channel: string; message: string }[] = [];
      const enqueued: { name: string; jobId: string | undefined }[] = [];
      const result = await dispatchPending(undefined, {
        dbName: DB,
        publish: async (channel, message) => {
          published.push({ channel, message });
        },
        enqueue: async (name, _payload, options) => {
          enqueued.push({ name, jobId: options.jobId });
        },
      });

      expect(result).toEqual({ dispatched: 2, failed: 0 });
      expect(pendingEventIds()).toHaveLength(0);
      expect(published.every((entry) => entry.channel === realtimeRedisChannel(DB))).toBe(true);
      expect(published.map((entry) => (JSON.parse(entry.message) as { event: string }).event).sort()).toEqual(["activity:new", "notification:new"]);
      expect(enqueued).toEqual([{ name: "notifications.push", jobId: ids.pushId }]);
      const open = await collection(db, "event_outbox").countDocuments({ dispatchedAt: null });
      expect(open).toBe(0);
    } finally {
      await handle.drop();
    }
  });
});
