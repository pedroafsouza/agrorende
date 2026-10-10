import { collection, getDb, scoped } from "@agrorende/db";

import type { Ctx } from "../../context";
import { toNotificationDto, type NotificationDTO } from "./dto";

export interface ListNotificationsQuery {
  readonly unreadOnly?: boolean;
  readonly limit?: number;
  readonly offset?: number;
}

/** The caller's own notifications, newest first. */
export async function listNotifications(ctx: Ctx, query: ListNotificationsQuery = {}): Promise<NotificationDTO[]> {
  const filter: Record<string, unknown> = { userId: ctx.userId, deletedAt: null };
  if (query.unreadOnly === true) filter.readAt = null;
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 201);
  const skip = Math.max(query.offset ?? 0, 0);
  const docs = await scoped({ orgId: ctx.orgId }, await getDb()).notifications.find(filter, { sort: { createdAt: -1, _id: -1 }, skip, limit }).toArray();
  return docs.map((doc) => toNotificationDto(doc));
}

export async function unreadNotificationCount(ctx: Ctx): Promise<number> {
  return collection(await getDb(), "notifications").countDocuments({ organizationId: ctx.orgId, userId: ctx.userId, readAt: null, deletedAt: null });
}
