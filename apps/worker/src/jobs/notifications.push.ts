import { notificationPrefsOf, type NotificationPrefs } from "@agrorende/contracts/dto";
import { Expo } from "expo-server-sdk";

import { readString, readStringArray, type Doc, type JobContext, type JobHandler } from "./index.js";

/**
 * `notifications.push` (ARCHITECTURE §10): sends pending notifications through the Expo Push
 * API in batches of 100, stores tickets, checks receipts after 15 minutes and deactivates
 * `DeviceNotRegistered` tokens. Each notification is claimed with a conditional update on
 * `pushedAt`, so the same outbox event processed twice sends one push. Users who muted push, or
 * muted the notification's type, are skipped (T05-008); the claim still marks those rows pushed.
 */

export const PUSH_BATCH_SIZE = 100;
export const RECEIPT_DELAY_MS = 15 * 60_000;
const RECEIPT_BATCH_SIZE = 300;
const SCAN_WINDOW_MS = 24 * 3_600_000;
const SCAN_LIMIT = 500;

export interface ExpoMessage {
  readonly to: string;
  readonly title: string;
  readonly body: string;
  readonly sound: "default";
  readonly data: Record<string, string>;
}

export type ExpoTicket = { status: "ok"; id: string } | { status: "error"; message?: string; details?: { error?: string } };
export type ExpoReceipt = { status: "ok" } | { status: "error"; message?: string; details?: { error?: string } };

export interface ExpoPushClient {
  send(messages: readonly ExpoMessage[]): Promise<ExpoTicket[]>;
  getReceipts(ticketIds: readonly string[]): Promise<Record<string, ExpoReceipt>>;
}

/** Expo Push client over `expo-server-sdk` (change request T05-004); the SDK chunks and retries. */
export function createExpoPushClient(accessToken = process.env.EXPO_ACCESS_TOKEN, expo?: Expo): ExpoPushClient {
  const client = expo ?? new Expo(accessToken !== undefined && accessToken !== "" ? { accessToken } : {});
  return {
    async send(messages) {
      const tickets: ExpoTicket[] = [];
      for (const chunk of client.chunkPushNotifications(messages.map((message) => ({ ...message })))) {
        const sent = await client.sendPushNotificationsAsync(chunk);
        for (const ticket of sent) {
          tickets.push(ticket.status === "ok" ? { status: "ok", id: ticket.id } : { status: "error", message: ticket.message, details: { ...(ticket.details?.error === undefined ? {} : { error: ticket.details.error }) } });
        }
      }
      return tickets;
    },
    async getReceipts(ticketIds) {
      const receipts: Record<string, ExpoReceipt> = {};
      for (const chunk of client.chunkPushNotificationReceiptIds([...ticketIds])) {
        const result = await client.getPushNotificationReceiptsAsync(chunk);
        for (const [id, receipt] of Object.entries(result)) {
          receipts[id] = receipt.status === "ok" ? { status: "ok" } : { status: "error", message: receipt.message, details: { ...(receipt.details?.error === undefined ? {} : { error: receipt.details.error }) } };
        }
      }
      return receipts;
    },
  };
}

interface TicketRef {
  readonly ticketId: string;
  readonly deviceId: string;
}

function receiptsKey(ctx: JobContext): string {
  return `${ctx.platform.keyPrefix}:push:receipts`;
}

async function deactivateDevice(ctx: JobContext, deviceId: string): Promise<boolean> {
  const result = await ctx.platform
    .table("devices")
    .updateOne({ _id: deviceId, pushStatus: { $ne: "TOKEN_INVALID" } }, { $set: { pushStatus: "TOKEN_INVALID", pushToken: null, updatedAt: ctx.now } });
  return result.modifiedCount === 1;
}

function isNotRegistered(result: ExpoTicket | ExpoReceipt): boolean {
  return result.status === "error" && result.details?.error === "DeviceNotRegistered";
}

async function pendingNotificationIds(ctx: JobContext, data: Doc): Promise<string[]> {
  const explicit = readStringArray(data, "notificationIds") ?? readStringArray(data, "pushNotificationIds");
  if (explicit !== undefined) {
    return explicit;
  }
  const rows = await ctx.platform
    .table("notifications")
    .find({ pushedAt: null, deletedAt: null, createdAt: { $gte: new Date(ctx.now.getTime() - SCAN_WINDOW_MS) } }, { projection: { _id: 1 }, limit: SCAN_LIMIT, sort: { createdAt: 1 } })
    .toArray();
  return rows.map((row) => String(row._id));
}

/** Claims notifications that were not pushed yet; a concurrent or repeated run claims nothing. */
async function claim(ctx: JobContext, ids: readonly string[]): Promise<Doc[]> {
  const claimed: Doc[] = [];
  for (const id of ids) {
    const row = await ctx.platform
      .table("notifications")
      .findOneAndUpdate({ _id: id, pushedAt: null, deletedAt: null }, { $set: { pushedAt: ctx.now } }, { returnDocument: "after" });
    if (row !== null) {
      claimed.push(row);
    }
  }
  return claimed;
}

interface Outgoing {
  readonly message: ExpoMessage;
  readonly deviceId: string;
  readonly notificationId: string;
}

/** User mute settings (T05-008): the in-app notification exists already; only the push is skipped. */
export function isMuted(prefs: NotificationPrefs | undefined, type: string | undefined): boolean {
  if (prefs === undefined) return false;
  return prefs.pushMuted || (type !== undefined && (prefs.mutedTypes as readonly string[]).includes(type));
}

async function buildMessages(ctx: JobContext, notifications: readonly Doc[]): Promise<Outgoing[]> {
  const userIds = [...new Set(notifications.map((row) => readString(row, "userId")).filter((id): id is string => id !== undefined))];
  if (userIds.length === 0) {
    return [];
  }
  const users = await ctx.platform.table("users").find({ _id: { $in: userIds }, isActive: true, deletedAt: null }, { projection: { _id: 1, notificationPrefs: 1 } }).toArray();
  const prefs = new Map(users.map((row) => [String(row._id), notificationPrefsOf(row.notificationPrefs)]));
  const activeUsers = new Set(prefs.keys());
  const devices = await ctx.platform
    .table("devices")
    .find({ userId: { $in: [...activeUsers] }, pushStatus: "OK", pushToken: { $type: "string" } }, { projection: { _id: 1, userId: 1, organizationId: 1, pushToken: 1 } })
    .toArray();
  const outgoing: Outgoing[] = [];
  for (const notification of notifications) {
    const userId = readString(notification, "userId");
    const orgId = readString(notification, "organizationId");
    if (isMuted(userId === undefined ? undefined : prefs.get(userId), readString(notification, "type"))) {
      continue;
    }
    for (const device of devices) {
      const token = readString(device, "pushToken");
      if (device.userId !== userId || device.organizationId !== orgId || token === undefined || token === "") {
        continue;
      }
      const data: Record<string, string> = { notificationId: String(notification._id), type: readString(notification, "type") ?? "" };
      const entityType = readString(notification, "entityType");
      const entityId = readString(notification, "entityId");
      if (entityType !== undefined && entityId !== undefined) {
        data.entityType = entityType;
        data.entityId = entityId;
      }
      outgoing.push({
        deviceId: String(device._id),
        notificationId: String(notification._id),
        message: { to: token, title: readString(notification, "title") ?? "", body: readString(notification, "body") ?? "", sound: "default", data },
      });
    }
  }
  return outgoing;
}

export interface PushSummary {
  readonly claimed: number;
  readonly sent: number;
  readonly batches: number;
  readonly deactivated: number;
  readonly receiptsChecked: number;
}

export async function sendPendingPushes(ctx: JobContext, data: Doc): Promise<Omit<PushSummary, "receiptsChecked">> {
  const claimed = await claim(ctx, await pendingNotificationIds(ctx, data));
  const outgoing = await buildMessages(ctx, claimed);
  let sent = 0;
  let batches = 0;
  let deactivated = 0;
  for (let start = 0; start < outgoing.length; start += PUSH_BATCH_SIZE) {
    const batch = outgoing.slice(start, start + PUSH_BATCH_SIZE);
    let tickets: ExpoTicket[];
    try {
      tickets = await ctx.platform.expo.send(batch.map((item) => item.message));
    } catch (error) {
      // Release the claims of this and later batches so the BullMQ retry sends them.
      const retry = [...new Set(outgoing.slice(start).map((item) => item.notificationId))];
      await ctx.platform.table("notifications").updateMany({ _id: { $in: retry }, pushedAt: ctx.now }, { $set: { pushedAt: null } });
      throw error;
    }
    batches += 1;
    const refs: string[] = [];
    for (const [index, ticket] of tickets.entries()) {
      const item = batch[index];
      if (item === undefined) {
        continue;
      }
      if (ticket.status === "ok") {
        sent += 1;
        refs.push(JSON.stringify({ ticketId: ticket.id, deviceId: item.deviceId } satisfies TicketRef));
      } else if (isNotRegistered(ticket) && (await deactivateDevice(ctx, item.deviceId))) {
        deactivated += 1;
      }
    }
    if (refs.length > 0) {
      await ctx.platform.redis.zadd(receiptsKey(ctx), ...refs.flatMap((ref) => [String(ctx.now.getTime()), ref]));
    }
  }
  return { claimed: claimed.length, sent, batches, deactivated };
}

/** Checks receipts of tickets older than 15 minutes and deactivates unregistered tokens. */
export async function checkPushReceipts(ctx: JobContext): Promise<{ checked: number; deactivated: number }> {
  const key = receiptsKey(ctx);
  const due = await ctx.platform.redis.zrangebyscore(key, "-inf", String(ctx.now.getTime() - RECEIPT_DELAY_MS), "LIMIT", "0", "1000");
  let checked = 0;
  let deactivated = 0;
  for (let start = 0; start < due.length; start += RECEIPT_BATCH_SIZE) {
    const members = due.slice(start, start + RECEIPT_BATCH_SIZE);
    const refs = members.map((member) => JSON.parse(member) as TicketRef);
    const receipts = await ctx.platform.expo.getReceipts(refs.map((ref) => ref.ticketId));
    for (const ref of refs) {
      const receipt = receipts[ref.ticketId];
      if (receipt !== undefined && isNotRegistered(receipt) && (await deactivateDevice(ctx, ref.deviceId))) {
        deactivated += 1;
      }
    }
    checked += refs.length;
    await ctx.platform.redis.zrem(key, ...members);
  }
  return { checked, deactivated };
}

export const handler: JobHandler = async (ctx, job): Promise<PushSummary> => {
  const sent = job.data.receiptsOnly === true ? { claimed: 0, sent: 0, batches: 0, deactivated: 0 } : await sendPendingPushes(ctx, job.data);
  const receipts = await checkPushReceipts(ctx);
  const summary = { ...sent, deactivated: sent.deactivated + receipts.deactivated, receiptsChecked: receipts.checked };
  ctx.logger.info("notifications.push", { jobId: job.id, ...summary });
  return summary;
};
