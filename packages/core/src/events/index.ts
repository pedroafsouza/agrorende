import { randomUUID } from "node:crypto";

import type { EntityRef } from "@agrorende/contracts/dto";
import { opsRoom, realtimeRedisChannel, type RedisRealtimeMessage } from "@agrorende/contracts/realtime";
import { collection, getDatabaseName, getDb } from "@agrorende/db";

import { enqueueJob, type EnqueueOptions, type JobName } from "../jobs/index";
import type { Redis } from "ioredis";

import { locationsRedis } from "../modules/locations/redis";
import { txDb } from "../sync/touch";
import type { SyncTx } from "../sync/types";

/**
 * A domain event written to `event_outbox` in the same transaction as the change that caused it
 * (ARCHITECTURE §7.3). `type` is the realtime event name (or a job event such as
 * `auth.appleRevoke`); `rooms` are the realtime rooms. When `rooms` is omitted and `entity` is set,
 * the event goes to the organisation's ops room.
 */
export interface DomainEvent {
  readonly id?: string;
  readonly type: string;
  readonly rooms?: readonly string[];
  readonly entity?: EntityRef;
  readonly data?: unknown;
  readonly pushNotificationIds?: readonly string[];
  readonly occurredAt?: Date;
}

/** Outbox type written by account deletion for Apple identities; the worker enqueues `auth.appleRevoke`. */
export const APPLE_REVOKE_EVENT = "auth.appleRevoke";

const pending = new Set<string>();

/** Inserts the event into `event_outbox` inside the caller's transaction and returns the event id. */
export async function emit(tx: SyncTx, event: DomainEvent): Promise<string> {
  const id = event.id ?? randomUUID();
  const rooms = event.rooms ?? (event.entity === undefined ? [] : [opsRoom(tx.orgId)]);
  const payload: Record<string, unknown> = { rooms: [...rooms], data: event.data ?? (event.entity === undefined ? null : { ...event.entity }) };
  if (event.pushNotificationIds !== undefined && event.pushNotificationIds.length > 0) {
    payload.pushNotificationIds = [...event.pushNotificationIds];
  }
  await txDb(tx).event_outbox.insertOne({
    _id: id,
    organizationId: tx.orgId,
    type: event.type,
    payload,
    createdAt: event.occurredAt ?? new Date(),
    dispatchedAt: null,
    attempts: 0,
  });
  pending.add(id);
  return id;
}

/** Ids emitted by this process that `dispatchPending()` has not handled yet. */
export function pendingEventIds(): string[] {
  return [...pending];
}

/**
 * Per-event dispatch claim. `acquire` returns `acquired` for the one caller allowed to publish,
 * `done` once a previous caller published (only `dispatchedAt` is still missing) and `busy` while
 * another caller holds the lease.
 */
export type DispatchClaimState = "acquired" | "done" | "busy";

export interface DispatchClaims {
  acquire(key: string): Promise<{ state: DispatchClaimState; token: string }>;
  complete(key: string): Promise<void>;
  release(key: string, token: string): Promise<void>;
}

export interface DispatchDeps {
  readonly publish?: (channel: string, message: string) => Promise<unknown>;
  readonly enqueue?: (name: JobName, payload: Readonly<Record<string, unknown>>, options: EnqueueOptions) => Promise<void>;
  readonly dbName?: string;
  /** Defaults to Redis claims, or to process-local claims when `publish` is injected. */
  readonly claims?: DispatchClaims;
}

const CLAIM_LEASE_MS = 30_000;
const CLAIM_DONE_MS = 7 * 24 * 60 * 60 * 1000;
const DONE = "done";
const RELEASE_SCRIPT = 'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) end return 0';

/** Redis key that serialises the dispatch of one outbox row, database-aware like the realtime channel. */
export function dispatchClaimKey(dbName: string, eventId: string): string {
  return `${realtimeRedisChannel(dbName).replace("agrorende:events", "agrorende:events:dispatch")}:${eventId}`;
}

/** Claims stored in Redis with `SET NX PX`, shared by every process that dispatches the outbox. */
export function redisDispatchClaims(redis: Pick<Redis, "set" | "get" | "eval"> = locationsRedis()): DispatchClaims {
  return {
    async acquire(key) {
      const token = `lease:${randomUUID()}`;
      const ok = await redis.set(key, token, "PX", CLAIM_LEASE_MS, "NX");
      if (ok === "OK") return { state: "acquired", token };
      return { state: (await redis.get(key)) === DONE ? "done" : "busy", token };
    },
    async complete(key) {
      await redis.set(key, DONE, "PX", CLAIM_DONE_MS);
    },
    async release(key, token) {
      await redis.eval(RELEASE_SCRIPT, 1, key, token);
    },
  };
}

const localClaimValues = new Map<string, { value: string; expiresAt: number }>();

/** Process-local claims, used when the publisher is injected (tests and single-process tools). */
export const localDispatchClaims: DispatchClaims = {
  async acquire(key) {
    const token = `lease:${randomUUID()}`;
    const current = localClaimValues.get(key);
    if (current !== undefined && current.expiresAt > Date.now()) return { state: current.value === DONE ? "done" : "busy", token };
    localClaimValues.set(key, { value: token, expiresAt: Date.now() + CLAIM_LEASE_MS });
    return { state: "acquired", token };
  },
  async complete(key) {
    localClaimValues.set(key, { value: DONE, expiresAt: Date.now() + CLAIM_DONE_MS });
  },
  async release(key, token) {
    if (localClaimValues.get(key)?.value === token) localClaimValues.delete(key);
  },
};

export interface DispatchResult {
  readonly dispatched: number;
  readonly failed: number;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * Best-effort post-commit dispatch: publishes each undispatched row on the database-aware realtime
 * channel, enqueues the follow-up jobs with `jobId = event._id` and marks the row dispatched.
 * A per-event claim makes repeated or concurrent calls publish each event once.
 * Failures are counted on the row (`attempts`, `lastError`) and otherwise swallowed —
 * `events.dispatch` in the worker retries rows older than 10 s.
 * Without `ids` it dispatches every id this process emitted since the last call.
 */
export async function dispatchPending(ids?: readonly string[], deps: DispatchDeps = {}): Promise<DispatchResult> {
  const targets = ids === undefined ? pendingEventIds() : [...ids];
  for (const id of targets) pending.delete(id);
  if (targets.length === 0) return { dispatched: 0, failed: 0 };
  const dbName = deps.dbName ?? getDatabaseName();
  const publish = deps.publish ?? ((channel: string, message: string) => locationsRedis().publish(channel, message));
  const enqueue = deps.enqueue ?? enqueueJob;
  let dispatched = 0;
  let failed = 0;
  try {
    const claims = deps.claims ?? (deps.publish === undefined ? redisDispatchClaims() : localDispatchClaims);
    const outbox = collection(await getDb(dbName), "event_outbox");
    const rows = await outbox.find({ _id: { $in: targets }, dispatchedAt: null }).toArray();
    for (const row of rows) {
      const eventId = String(row._id);
      const orgId = String(row.organizationId);
      const type = String(row.type);
      const payload = asRecord(row.payload);
      const key = dispatchClaimKey(dbName, eventId);
      let lease: string | null = null;
      try {
        const claim = await claims.acquire(key);
        if (claim.state === "busy") continue;
        if (claim.state === "acquired") {
          lease = claim.token;
          if (type === APPLE_REVOKE_EVENT) {
            const identityId = asRecord(payload.data).identityId;
            if (typeof identityId === "string") await enqueue("auth.appleRevoke", { orgId, identityId }, { jobId: eventId });
          }
          const rooms = stringArray(payload.rooms);
          if (rooms.length > 0) {
            const message: RedisRealtimeMessage = { eventId, orgId, rooms, event: type as RedisRealtimeMessage["event"], payload: payload.data ?? null };
            await publish(realtimeRedisChannel(dbName), JSON.stringify(message));
          }
          const notificationIds = stringArray(payload.pushNotificationIds);
          if (notificationIds.length > 0) await enqueue("notifications.push", { eventId, orgId, notificationIds }, { jobId: eventId });
          await claims.complete(key);
          lease = null;
        }
        await outbox.updateOne({ _id: row._id, dispatchedAt: null }, { $set: { dispatchedAt: new Date() } });
        dispatched += 1;
      } catch (error) {
        failed += 1;
        if (lease !== null) await claims.release(key, lease).catch(() => undefined);
        const lastError = error instanceof Error ? error.name : "Error";
        await outbox.updateOne({ _id: row._id, dispatchedAt: null }, { $inc: { attempts: 1 }, $set: { lastError } }).catch(() => undefined);
      }
    }
  } catch {
    return { dispatched, failed: targets.length - dispatched };
  }
  return { dispatched, failed };
}
