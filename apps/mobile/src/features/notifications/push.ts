import type { DeviceRegisterRequest } from "@agrorende/api-client";

import type { SqlDb } from "../../db/sql";
import { markNotificationsRead } from "../../sync/mutators/notifications";
import { parsePushData } from "./logic";

export interface PushRegistrationDeps {
  readonly permissionGranted: () => Promise<boolean>;
  readonly pushToken: () => Promise<string | undefined>;
  readonly register: (body: DeviceRegisterRequest) => Promise<unknown>;
  readonly device: Omit<DeviceRegisterRequest, "pushToken">;
}

/**
 * Registers this installation for the signed-in user (PLT-12). The server clears the push token on
 * other users' rows with the same installation id, so pushes reach the active user only. Never
 * prompts: the permission rationale screens own the system prompt.
 */
export async function registerPushForActiveUser(deps: PushRegistrationDeps): Promise<"registered" | "noPermission" | "noToken"> {
  if (!(await deps.permissionGranted())) {
    await deps.register({ ...deps.device });
    return "noPermission";
  }
  const token = await deps.pushToken();
  await deps.register(token === undefined ? { ...deps.device } : { ...deps.device, pushToken: token });
  return token === undefined ? "noToken" : "registered";
}

/**
 * A tap on a push (A§13.5): marks the notification read when it belongs to the active user's local
 * mirror and returns the screen to open. A push meant for another user of a shared phone is not
 * marked, so it never writes into this user's outbox.
 */
export async function handlePushTap(db: SqlDb, userId: string, data: unknown): Promise<string | undefined> {
  const parsed = parsePushData(data);
  if (parsed.notificationId !== undefined) {
    const row = await db.get(`SELECT id, readAt FROM notifications WHERE id = ? AND userId = ?`, [parsed.notificationId, userId]);
    if (row !== undefined && (row.readAt === null || row.readAt === undefined)) await markNotificationsRead({ ids: [parsed.notificationId] });
  }
  return parsed.route;
}
