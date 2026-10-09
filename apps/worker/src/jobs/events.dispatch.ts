import { realtimeRedisChannel, type RedisRealtimeMessage } from "@agrorende/contracts/realtime";
import { dispatchClaimKey, localDispatchClaims, redisDispatchClaims, type DispatchClaims } from "@agrorende/core/events";
import { Queue } from "bullmq";
import type { Redis } from "ioredis";

import { JOB_REGISTRY } from "../jobRegistry.js";
import { readString, readStringArray, workerQueuePrefix, type Doc, type JobHandler, type WorkerCollection, type WorkerLogger } from "./index.js";

/**
 * `events.dispatch` (ARCHITECTURE §7.3, §10): retries `event_outbox` rows that the request process
 * did not dispatch after commit. Each row is published on the database-aware realtime channel and,
 * when it carries `pushNotificationIds`, enqueues `notifications.push` with `jobId = event._id`.
 * Every row is published under the same per-event claim as core's `dispatchPending`
 * (`SET NX PX` lease, then `done`), so a concurrent run of this job or a race with the request
 * process publishes each event once.
 */

export const DISPATCH_DELAY_MS = 10_000;
export const DISPATCH_BATCH = 100;
const MAX_ATTEMPTS = 20;
/** Outbox type written by account deletion for Apple identities (core `auth/service.ts`). */
export const APPLE_REVOKE_EVENT = "auth.appleRevoke";

export interface PushJobInput {
  readonly eventId: string;
  readonly orgId: string;
  readonly notificationIds: readonly string[];
}

export interface EventOutboxDispatcherDeps {
  readonly outbox: WorkerCollection;
  readonly publish: (message: RedisRealtimeMessage) => Promise<void>;
  readonly enqueuePush: (input: PushJobInput) => Promise<void>;
  readonly enqueueAppleRevoke: (input: { readonly eventId: string; readonly orgId: string; readonly identityId: string }) => Promise<void>;
  readonly logger?: WorkerLogger;
  /** Per-event claims shared with core's `dispatchPending`; defaults to process-local claims. */
  readonly claims?: DispatchClaims;
  /** Database name used in the claim key, so the job and core claim the same key. */
  readonly dbName?: string;
}

export interface EventOutboxDispatcher {
  readonly dispatchUndispatched: (input: { readonly olderThan: Date; readonly limit: number }) => Promise<{ readonly dispatched: number; readonly failed: number }>;
}

function payloadOf(row: Doc): Doc {
  const payload = row.payload;
  return typeof payload === "object" && payload !== null && !Array.isArray(payload) ? (payload as Doc) : {};
}

export function createEventOutboxDispatcher(deps: EventOutboxDispatcherDeps): EventOutboxDispatcher {
  const claims = deps.claims ?? localDispatchClaims;
  return {
    async dispatchUndispatched({ olderThan, limit }) {
      const rows = await deps.outbox
        .find({ dispatchedAt: null, createdAt: { $lte: olderThan }, attempts: { $lt: MAX_ATTEMPTS } }, { sort: { createdAt: 1 }, limit })
        .toArray();
      let dispatched = 0;
      let failed = 0;
      for (const row of rows) {
        const eventId = String(row._id);
        const orgId = readString(row, "organizationId");
        const type = readString(row, "type");
        if (orgId === undefined || type === undefined) continue;
        const payload = payloadOf(row);
        const key = deps.dbName === undefined ? eventId : dispatchClaimKey(deps.dbName, eventId);
        let lease: string | null = null;
        try {
          const claim = await claims.acquire(key);
          if (claim.state === "busy") continue;
          if (claim.state === "acquired") {
            lease = claim.token;
            if (type === APPLE_REVOKE_EVENT) {
              const identityId = readString(payloadOf({ payload: payload.data }), "identityId");
              if (identityId !== undefined) await deps.enqueueAppleRevoke({ eventId, orgId, identityId });
            }
            const rooms = readStringArray(payload, "rooms") ?? [];
            if (rooms.length > 0) {
              await deps.publish({ eventId, orgId, rooms, event: type as RedisRealtimeMessage["event"], payload: payload.data ?? null });
            }
            const notificationIds = readStringArray(payload, "pushNotificationIds") ?? [];
            if (notificationIds.length > 0) await deps.enqueuePush({ eventId, orgId, notificationIds });
            await claims.complete(key);
            lease = null;
          }
          await deps.outbox.updateOne({ _id: row._id, dispatchedAt: null }, { $set: { dispatchedAt: new Date(), lastError: null } });
          dispatched += 1;
        } catch (error) {
          failed += 1;
          if (lease !== null) await claims.release(key, lease).catch(() => undefined);
          const errorName = error instanceof Error ? error.name : "unknown";
          await deps.outbox.updateOne({ _id: row._id }, { $inc: { attempts: 1 }, $set: { lastError: errorName } });
          deps.logger?.warn("events.dispatch.failed", { eventId, orgId, type, errorName });
        }
      }
      return { dispatched, failed };
    },
  };
}

const queues = new WeakMap<Redis, Map<string, Queue>>();

function queueFor(redis: Redis, dbName: string, queueName: string): Queue {
  let byKey = queues.get(redis);
  if (byKey === undefined) {
    byKey = new Map();
    queues.set(redis, byKey);
  }
  const key = `${dbName}|${queueName}`;
  let queue = byKey.get(key);
  if (queue === undefined) {
    queue = new Queue(queueName, { connection: redis, prefix: workerQueuePrefix(dbName) });
    byKey.set(key, queue);
  }
  return queue;
}

async function enqueue(platform: { readonly redis: Redis; readonly dbName: string }, name: "notifications.push" | "auth.appleRevoke", data: Doc, jobId: string): Promise<void> {
  const definition = JOB_REGISTRY[name];
  await queueFor(platform.redis, platform.dbName, definition.queueName).add(name, data, {
    jobId,
    attempts: definition.attempts,
    backoff: definition.backoff,
    removeOnComplete: 1_000,
    removeOnFail: 5_000,
  });
}

export const handler: JobHandler = async (ctx) => {
  const { platform } = ctx;
  const dispatcher = createEventOutboxDispatcher({
    outbox: platform.table("event_outbox"),
    logger: ctx.logger,
    claims: redisDispatchClaims(platform.redis),
    dbName: platform.dbName,
    publish: async (message) => {
      await platform.redis.publish(realtimeRedisChannel(platform.dbName), JSON.stringify(message));
    },
    enqueuePush: ({ eventId, orgId, notificationIds }) => enqueue(platform, "notifications.push", { eventId, orgId, notificationIds: [...notificationIds] }, eventId),
    enqueueAppleRevoke: ({ eventId, orgId, identityId }) => enqueue(platform, "auth.appleRevoke", { orgId, identityId }, eventId),
  });
  const result = await dispatcher.dispatchUndispatched({ olderThan: new Date(ctx.now.getTime() - DISPATCH_DELAY_MS), limit: DISPATCH_BATCH });
  if (result.dispatched > 0 || result.failed > 0) ctx.logger.info("events.dispatch.done", { ...result });
  return result;
};
