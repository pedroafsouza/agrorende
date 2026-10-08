import { randomUUID } from "node:crypto";

import type { EntityRef } from "@agrorende/contracts/dto";
import { opsRoom, realtimeRedisChannel, type RedisRealtimeMessage } from "@agrorende/contracts/realtime";
import { collection, getDatabaseName, getDb } from "@agrorende/db";

import { enqueueJob, type EnqueueOptions, type JobName } from "../jobs/index.js";
import { locationsRedis } from "../modules/locations/redis.js";
import { txDb } from "../sync/touch.js";
import type { SyncTx } from "../sync/types.js";

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

export interface DispatchDeps {
  readonly publish?: (channel: string, message: string) => Promise<unknown>;
  readonly enqueue?: (name: JobName, payload: Readonly<Record<string, unknown>>, options: EnqueueOptions) => Promise<void>;
  readonly dbName?: string;
}

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
 * Failures are swallowed — `events.dispatch` in the worker retries rows older than 10 s.
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
    const outbox = collection(await getDb(dbName), "event_outbox");
    const rows = await outbox.find({ _id: { $in: targets }, dispatchedAt: null }).toArray();
    for (const row of rows) {
      const eventId = String(row._id);
      const orgId = String(row.organizationId);
      const type = String(row.type);
      const payload = asRecord(row.payload);
      try {
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
        await outbox.updateOne({ _id: row._id, dispatchedAt: null }, { $set: { dispatchedAt: new Date() } });
        dispatched += 1;
      } catch {
        failed += 1;
      }
    }
  } catch {
    return { dispatched, failed: targets.length - dispatched };
  }
  return { dispatched, failed };
}
