import type { JobHandler } from "./index.js";

interface PurgeModule {
  runOrgPurge(options: { mediaRoot: string; now: Date; db?: unknown }): Promise<readonly { organizationId: string; deleted: Record<string, number> }[]>;
}

/**
 * `orgs.purge` (TEN-07, 03:20): deletes CANCELLED organisations whose 90-day export window has
 * passed — every row, the media and export folders — and records `org.purge` in the platform audit.
 */
export const handler: JobHandler = async (ctx) => {
  const [purge, dbModule] = await Promise.all([
    import("@agrorende/core/modules/tenancy/purge") as Promise<unknown> as Promise<PurgeModule>,
    import("@agrorende/db"),
  ]);
  const db = await dbModule.getDb(ctx.platform.dbName);
  const results = await purge.runOrgPurge({ mediaRoot: ctx.platform.mediaRoot, now: ctx.now, db });
  for (const result of results) ctx.logger.info("orgs.purge.done", { orgId: result.organizationId, deleted: result.deleted });
  return { purged: results.length };
};
