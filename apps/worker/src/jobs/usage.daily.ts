import type { JobHandler } from "./index.js";

interface UsageModule {
  runUsageDaily(now: Date, db?: unknown): Promise<{ organizations: number }>;
}

/**
 * `usage.daily` (TEN-05, 03:00): recomputes this month's `OrgUsage` row for every organisation —
 * active field users, office users, storage bytes and assets. Re-runs overwrite the same row.
 */
export const handler: JobHandler = async (ctx) => {
  const [usage, dbModule] = await Promise.all([
    import("@agrorende/core/modules/tenancy/usage") as Promise<unknown> as Promise<UsageModule>,
    import("@agrorende/db"),
  ]);
  const db = await dbModule.getDb(ctx.platform.dbName);
  const result = await usage.runUsageDaily(ctx.now, db);
  ctx.logger.info("usage.daily", result);
  return result;
};
