import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

import { daysAgo, deleteInChunks, HOUR_MS, readString, type Doc, type JobContext, type JobHandler } from "./index.js";

/**
 * `media.cleanupPending` (ARCHITECTURE §10, EC-SYN-27), daily at 03:00:
 * - reports PENDING media older than 24 h per organisation (the attention source that
 *   `GET /attention` computes by the same query);
 * - marks PENDING media older than 30 days FAILED, which keeps it in the attention queue;
 * - deletes the files of media soft-deleted more than 7 days ago, then hard-deletes the rows;
 * - removes `MEDIA_ROOT/.uploads/<uploadId>` older than 24 h and `.tmp` files older than 1 h.
 */

export const MEDIA_PENDING_ATTENTION_MS = 24 * HOUR_MS;
export const MEDIA_PENDING_FAIL_DAYS = 30;
export const MEDIA_SOFT_DELETE_DAYS = 7;
export const UPLOAD_SESSION_MAX_AGE_MS = 24 * HOUR_MS;
export const TMP_FILE_MAX_AGE_MS = HOUR_MS;

/** PENDING media older than 24 h, counted per organisation (no ids, names or coordinates). */
export async function mediaPendingAttention(ctx: JobContext): Promise<{ orgId: string; count: number }[]> {
  const rows = await ctx.platform
    .table("media")
    .aggregate([
      { $match: { status: "PENDING", deletedAt: null, createdAt: { $lt: new Date(ctx.now.getTime() - MEDIA_PENDING_ATTENTION_MS) } } },
      { $group: { _id: "$organizationId", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ])
    .toArray();
  return rows.map((row) => ({ orgId: String(row._id), count: Number(row.count) }));
}

/** PENDING media older than 30 days becomes FAILED with a new `syncVersion`, so devices pull it. */
async function markStalePendingFailed(ctx: JobContext): Promise<number> {
  const media = ctx.platform.table("media");
  const filter = { status: "PENDING", deletedAt: null, createdAt: { $lt: daysAgo(ctx.now, MEDIA_PENDING_FAIL_DAYS) } };
  const orgIds = (await media.aggregate([{ $match: filter }, { $group: { _id: "$organizationId" } }]).toArray()).map((row) => String(row._id));
  let marked = 0;
  for (const orgId of orgIds) {
    const syncVersion = await ctx.platform.nextSyncVersion(orgId);
    const result = await media.updateMany({ ...filter, organizationId: orgId }, { $set: { status: "FAILED", updatedAt: ctx.now, syncVersion } });
    marked += result.modifiedCount;
  }
  return marked;
}

function mediaKeys(row: Doc): string[] {
  const keys = [readString(row, "storageKey"), readString(row, "thumbnailKey")];
  const variants = row.variants;
  if (variants !== null && typeof variants === "object") {
    for (const variant of Object.values(variants as Doc)) {
      if (variant !== null && typeof variant === "object") {
        keys.push(readString(variant as Doc, "storageKey"), readString(variant as Doc, "key"));
      }
    }
  }
  return [...new Set(keys.filter((key): key is string => key !== undefined && key !== ""))];
}

async function purgeSoftDeleted(ctx: JobContext): Promise<number> {
  const media = ctx.platform.table("media");
  const filter = { deletedAt: { $lt: daysAgo(ctx.now, MEDIA_SOFT_DELETE_DAYS) } };
  let purged = 0;
  for (;;) {
    const rows = await media.find(filter, { projection: { _id: 1, storageKey: 1, thumbnailKey: 1, variants: 1 }, limit: 200 }).toArray();
    if (rows.length === 0) {
      return purged;
    }
    for (const row of rows) {
      for (const key of mediaKeys(row)) {
        await ctx.platform.store.delete(key);
      }
    }
    purged += await deleteInChunks(media, { _id: { $in: rows.map((row) => row._id) }, ...filter });
    if (rows.length < 200) {
      return purged;
    }
  }
}

async function entries(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

async function olderThan(file: string, cutoffMs: number): Promise<boolean> {
  try {
    return (await stat(file)).mtimeMs < cutoffMs;
  } catch {
    return false;
  }
}

async function removeTmpFiles(dir: string, cutoffMs: number, depth: number): Promise<number> {
  let removed = 0;
  for (const name of await entries(dir)) {
    const file = path.join(dir, name);
    const info = await stat(file).catch(() => undefined);
    if (info === undefined) {
      continue;
    }
    if (info.isDirectory()) {
      if (depth > 0 && name !== ".uploads") {
        removed += await removeTmpFiles(file, cutoffMs, depth - 1);
      }
    } else if (name.endsWith(".tmp") && info.mtimeMs < cutoffMs) {
      await rm(file, { force: true });
      removed += 1;
    }
  }
  return removed;
}

/** Filesystem part of the cleanup; scoped to `MEDIA_ROOT` and never follows symlinks. */
export async function cleanupMediaRoot(ctx: JobContext): Promise<{ uploads: number; tmpFiles: number }> {
  const root = path.resolve(ctx.platform.mediaRoot);
  const uploadsDir = path.join(root, ".uploads");
  let uploads = 0;
  for (const uploadId of await entries(uploadsDir)) {
    const target = path.join(uploadsDir, uploadId);
    if (await olderThan(target, ctx.now.getTime() - UPLOAD_SESSION_MAX_AGE_MS)) {
      await rm(target, { recursive: true, force: true });
      uploads += 1;
    }
  }
  const tmpCutoff = ctx.now.getTime() - TMP_FILE_MAX_AGE_MS;
  let tmpFiles = 0;
  const tmpDir = path.join(root, ".tmp");
  for (const name of await entries(tmpDir)) {
    const target = path.join(tmpDir, name);
    if (await olderThan(target, tmpCutoff)) {
      await rm(target, { recursive: true, force: true });
      tmpFiles += 1;
    }
  }
  tmpFiles += await removeTmpFiles(root, tmpCutoff, 4);
  return { uploads, tmpFiles };
}

export const handler: JobHandler = async (ctx) => {
  const markedFailed = await markStalePendingFailed(ctx);
  const attention = await mediaPendingAttention(ctx);
  const purged = await purgeSoftDeleted(ctx);
  const files = await cleanupMediaRoot(ctx);
  const summary = { pendingAttention: attention.reduce((sum, row) => sum + row.count, 0), markedFailed, purged, ...files };
  for (const row of attention) {
    ctx.logger.info("attention.media_pending", row);
  }
  ctx.logger.info("media.cleanupPending", summary);
  return { ...summary, attention };
};
