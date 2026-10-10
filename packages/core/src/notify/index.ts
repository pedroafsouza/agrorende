import { randomUUID } from "node:crypto";

import type { NotificationType, Role } from "@agrorende/contracts/enums";
import type { EntityRef } from "@agrorende/contracts/dto";
import { RealtimeServerEvents, userRoom } from "@agrorende/contracts/realtime";

import { emit } from "../events/index";
import { toWire } from "../sync/pull";
import { txDb } from "../sync/touch";
import type { SyncTx } from "../sync/types";
import { renderNotification } from "./templates";

export { renderIcu, renderNotification, resolveNotificationLocale, NOTIFICATION_TEMPLATES } from "./templates";

export interface NotificationInput {
  readonly type: NotificationType;
  readonly userIds: readonly string[];
  readonly entity: EntityRef;
  readonly params: Readonly<Record<string, string | number>>;
}

/**
 * Payload stored in `event_outbox` rows written by T02 code. `events.dispatch` publishes
 * `{ eventId, orgId, rooms, event: type, payload: data }` and, when `pushNotificationIds` is
 * present, enqueues `notifications.push` with `jobId = eventId`.
 */
export interface OutboxPayload {
  readonly rooms: readonly string[];
  readonly data: unknown;
  readonly pushNotificationIds?: readonly string[];
}

/** Inserts an `event_outbox` row inside the caller's transaction (through `events.emit`) and returns its id. */
export async function writeOutbox(tx: SyncTx, type: string, payload: OutboxPayload, now: Date = new Date()): Promise<string> {
  return emit(tx, {
    type,
    rooms: payload.rooms,
    data: payload.data,
    ...(payload.pushNotificationIds === undefined ? {} : { pushNotificationIds: payload.pushNotificationIds }),
    occurredAt: now,
  });
}

/** Writes notification rows (rendered in each recipient's locale) and their outbox events in the caller's transaction. */
export async function createNotification(tx: SyncTx, input: NotificationInput): Promise<string[]> {
  const recipients = [...new Set(input.userIds)];
  if (recipients.length === 0) {
    return [];
  }
  const db = txDb(tx);
  const now = new Date();
  const users = await db.users.find({ _id: { $in: recipients }, deletedAt: null }, { projection: { _id: 1, locale: 1 } }).toArray();
  const ids: string[] = [];
  for (const user of users) {
    const { title, body } = renderNotification(input.type, input.params, user.locale);
    const id = randomUUID();
    const doc = {
      _id: id,
      organizationId: tx.orgId,
      syncVersion: tx.syncVersion,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      userId: user._id,
      type: input.type,
      title,
      body,
      entityType: input.entity.entityType,
      entityId: input.entity.entityId,
      readAt: null,
      pushedAt: null,
    };
    await db.notifications.insertOne(doc);
    await writeOutbox(
      tx,
      RealtimeServerEvents.notificationNew,
      { rooms: [userRoom(user._id)], data: toWire(doc), pushNotificationIds: [id] },
      now,
    );
    ids.push(id);
  }
  return ids;
}

/** Active office users of the organisation with one of the given roles. */
export async function officeRecipients(tx: SyncTx, orgId: string, roles: readonly Role[]): Promise<string[]> {
  if (orgId !== tx.orgId) {
    return [];
  }
  const users = await txDb(tx)
    .users.find({ role: { $in: [...roles] }, isActive: true, disabledAt: null, archivedAt: null, deletedAt: null }, { projection: { _id: 1 } })
    .toArray();
  return users.map((user) => user._id);
}
