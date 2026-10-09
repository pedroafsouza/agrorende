import type { SqlDb } from "../../db/sql";

export interface LocalNotification {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly body: string;
  readonly entityType: string | null;
  readonly entityId: string | null;
  readonly createdAt: string;
  readonly read: boolean;
}

/** Deep link for the record a notification points at (A§13.5), or undefined when it has none. */
export function routeForNotification(entityType: string | null | undefined, entityId: string | null | undefined): string | undefined {
  if (entityId === null || entityId === undefined || entityId.length === 0) return undefined;
  switch (entityType) {
    case "FIELD_REPORT":
      return `/reports/${entityId}`;
    case "WORK_ORDER":
      return `/jobs/${entityId}`;
    case "RENTAL":
      return `/rentals/${entityId}`;
    case "ASSET":
      return `/assets/${entityId}`;
    default:
      return undefined;
  }
}

/** Reads the push payload sent by the worker (`{notificationId, type, entityType, entityId}`). */
export function parsePushData(data: unknown): { readonly notificationId?: string; readonly route?: string } {
  if (data === null || typeof data !== "object") return {};
  const record = data as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : undefined);
  const notificationId = text(record.notificationId);
  const route = routeForNotification(text(record.entityType), text(record.entityId));
  return { ...(notificationId === undefined ? {} : { notificationId }), ...(route === undefined ? {} : { route }) };
}

export async function listLocalNotifications(db: SqlDb, userId: string): Promise<LocalNotification[]> {
  const rows = await db.all(
    `SELECT id, type, title, body, entityType, entityId, createdAt, readAt FROM notifications
      WHERE userId = ? AND deletedAt IS NULL ORDER BY createdAt DESC, id DESC LIMIT 200`,
    [userId],
  );
  return rows.map((row) => ({
    id: String(row.id),
    type: String(row.type ?? ""),
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    entityType: typeof row.entityType === "string" ? row.entityType : null,
    entityId: typeof row.entityId === "string" ? row.entityId : null,
    createdAt: String(row.createdAt ?? ""),
    read: row.readAt !== null && row.readAt !== undefined,
  }));
}

export async function countUnreadNotifications(db: SqlDb, userId: string): Promise<number> {
  const row = await db.get(`SELECT COUNT(*) AS n FROM notifications WHERE userId = ? AND readAt IS NULL AND deletedAt IS NULL`, [userId]);
  return Number(row?.n ?? 0);
}
