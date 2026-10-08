import { randomUUID } from "node:crypto";

import type { EntityRef } from "@agrorende/contracts/dto";
import type { EntityType } from "@agrorende/contracts/enums";
import { RealtimeServerEvents, opsRoom } from "@agrorende/contracts/realtime";

import { emit } from "../events/index.js";
import { toWire } from "../sync/pull.js";
import { txDb } from "../sync/touch.js";
import type { SyncTx } from "../sync/types.js";

/**
 * One ActivityEvent row (ARCHITECTURE §6, PLT-13). Either `entity` or the pair
 * `entityType`/`entityId` identifies the subject. `at` is accepted as an alias of `occurredAt`
 * and `params` as an alias of `meta`, so callers written against the T01 skeleton keep working.
 */
export interface ActivityInput {
  readonly entity?: EntityRef;
  readonly entityType?: EntityType;
  readonly entityId?: string;
  readonly action: string;
  readonly actorId?: string | null;
  readonly deviceId?: string | null;
  readonly fromStatus?: string | null;
  readonly toStatus?: string | null;
  readonly meta?: Readonly<Record<string, unknown>>;
  readonly params?: Readonly<Record<string, string | number | boolean | null>>;
  readonly lat?: number | null;
  readonly lng?: number | null;
  readonly occurredAt?: Date;
  readonly at?: Date;
  readonly receivedAt?: Date;
  readonly clockOffsetMs?: number | null;
  readonly mutationId?: string | null;
}

export interface RecordActivityOptions {
  /** Also emit `activity:new` to the organisation's ops room through the outbox. */
  readonly publish?: boolean;
}

function subjectOf(input: ActivityInput): EntityRef {
  if (input.entity !== undefined) return input.entity;
  if (input.entityType === undefined || input.entityId === undefined) {
    throw new TypeError("recordActivity needs either entity or entityType and entityId");
  }
  return { entityType: input.entityType, entityId: input.entityId };
}

/**
 * Inserts an ActivityEvent inside the caller's `withSyncTx` transaction and returns its id.
 * Every state change writes one (PLT-13). The row is synced, so it carries `tx.syncVersion`.
 */
export async function recordActivity(tx: SyncTx, input: ActivityInput, options: RecordActivityOptions = {}): Promise<string> {
  const subject = subjectOf(input);
  const now = new Date();
  const id = randomUUID();
  const doc = {
    _id: id,
    organizationId: tx.orgId,
    syncVersion: tx.syncVersion,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    actorId: input.actorId ?? null,
    deviceId: input.deviceId ?? null,
    entityType: subject.entityType,
    entityId: subject.entityId,
    action: input.action,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    meta: { ...(input.params ?? {}), ...(input.meta ?? {}) },
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    occurredAt: input.occurredAt ?? input.at ?? now,
    receivedAt: input.receivedAt ?? now,
    clockOffsetMs: input.clockOffsetMs ?? null,
    mutationId: input.mutationId ?? null,
  };
  await txDb(tx).activity_events.insertOne(doc);
  if (options.publish === true) {
    await emit(tx, { type: RealtimeServerEvents.activityNew, rooms: [opsRoom(tx.orgId)], data: toWire(doc) });
  }
  return id;
}
