import { daysAgo, deleteInChunks, type JobHandler } from "./index.js";

/**
 * `tombstones.prune` (ARCHITECTURE §7.5 and §10), daily at 03:45: hard-deletes soft-deleted
 * rows of synced collections whose `deletedAt` is older than 90 days. Before deleting, it raises
 * `SyncCounter.horizonVersion` to the highest `syncVersion` being deleted, so a device whose
 * cursor is below the horizon gets a reset instead of silently missing tombstones.
 */

export const TOMBSTONE_RETENTION_DAYS = 90;

/** Users stay as anonymised rows that business records keep pointing at; media has its own job. */
export const TOMBSTONE_EXCLUDED = new Set(["users", "media"]);

export const handler: JobHandler = async (ctx) => {
  const cutoff = daysAgo(ctx.now, TOMBSTONE_RETENTION_DAYS);
  const counters = ctx.platform.table("sync_counters");
  const deletedByCollection: Record<string, number> = {};
  let deleted = 0;
  for (const name of ctx.platform.syncedCollections.filter((collection) => !TOMBSTONE_EXCLUDED.has(collection))) {
    const target = ctx.platform.table(name);
    const groups = await target
      .aggregate([{ $match: { deletedAt: { $lt: cutoff } } }, { $group: { _id: "$organizationId", maxVersion: { $max: "$syncVersion" } } }])
      .toArray();
    let count = 0;
    for (const group of groups) {
      const orgId = String(group._id);
      const maxVersion = Number(group.maxVersion ?? 0);
      await counters.updateOne({ _id: orgId }, { $max: { horizonVersion: maxVersion } });
      count += await deleteInChunks(target, { organizationId: orgId, deletedAt: { $lt: cutoff }, syncVersion: { $lte: maxVersion } });
    }
    if (count > 0) {
      deletedByCollection[name] = count;
    }
    deleted += count;
  }
  ctx.logger.info("tombstones.prune", { deleted, collections: deletedByCollection });
  return { deleted, collections: deletedByCollection };
};
