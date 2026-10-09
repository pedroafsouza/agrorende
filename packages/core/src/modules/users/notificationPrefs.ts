import { notificationPrefsOf, type NotificationPrefs, type UpdateMeInput } from "@agrorende/contracts/dto";
import { AppError } from "@agrorende/contracts/errors";

import type { Ctx } from "../../context.js";
import { selfUserDto } from "../../auth/service.js";
import { txDb } from "../../sync/touch.js";
import { withSyncTx } from "../../sync/withSyncTx.js";

type Row = Record<string, unknown>;

/** Adds the effective push mute settings (T05-008) to the caller's own user row; old rows get the default. */
export function withNotificationPrefs(row: Row): Row {
  return { ...row, notificationPrefs: notificationPrefsOf(row.notificationPrefs) };
}

/** Merges a partial `notificationPrefs` patch into the stored settings. */
export function mergeNotificationPrefs(current: unknown, patch: NonNullable<UpdateMeInput["notificationPrefs"]>): NotificationPrefs {
  const base = notificationPrefsOf(current);
  return notificationPrefsOf({ pushMuted: patch.pushMuted ?? base.pushMuted, mutedTypes: patch.mutedTypes ?? base.mutedTypes });
}

/** `PATCH /me {notificationPrefs}`: persists the caller's push mute settings and returns their own user row. */
export async function updateNotificationPrefs(ctx: Ctx, patch: NonNullable<UpdateMeInput["notificationPrefs"]>): Promise<Row> {
  return withSyncTx(ctx, async (tx) => {
    const users = txDb(tx).users;
    const current = await users.findOne({ _id: ctx.userId });
    if (current === null) throw new AppError("UNAUTHENTICATED");
    const notificationPrefs = mergeNotificationPrefs(current.notificationPrefs, patch);
    await users.updateOne({ _id: ctx.userId }, { $set: { notificationPrefs, updatedAt: new Date(), syncVersion: tx.syncVersion } });
    const user = await users.findOne({ _id: ctx.userId });
    if (user === null) throw new AppError("UNAUTHENTICATED");
    return withNotificationPrefs(selfUserDto(user));
  });
}
