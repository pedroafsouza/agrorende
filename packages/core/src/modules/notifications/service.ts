import type { Ctx } from "../../context";
import { txDb } from "../../sync/touch";
import type { SyncTx } from "../../sync/types";

/** `notification.markRead`: marks the caller's own unread notifications; foreign ids are ignored. */
export async function markRead(tx: SyncTx, ctx: Ctx, ids: readonly string[]): Promise<number> {
  const now = new Date();
  const result = await txDb(tx).notifications.updateMany(
    { _id: { $in: [...ids] }, userId: ctx.userId, readAt: null, deletedAt: null },
    { $set: { readAt: now, syncVersion: tx.syncVersion, updatedAt: now } },
  );
  return result.modifiedCount;
}

/** `POST /notifications/read {all: true}`: marks every unread notification of the caller. */
export async function markAllRead(tx: SyncTx, ctx: Ctx): Promise<number> {
  const now = new Date();
  const result = await txDb(tx).notifications.updateMany(
    { userId: ctx.userId, readAt: null, deletedAt: null },
    { $set: { readAt: now, syncVersion: tx.syncVersion, updatedAt: now } },
  );
  return result.modifiedCount;
}
