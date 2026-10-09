import { loadDbModule, readString, type Doc, type JobContext, type JobHandler } from "./index.js";

/**
 * `maintenance.dueScan` (ARCHITECTURE §8 "Maintenance" and §10, ERP-06): hourly, for every active
 * organisation, opens one PREVENTIVE work order per maintenance plan and asset that is inside the
 * plan's lead window and has no open preventive job of that plan, and notifies ADMIN and MANAGER
 * (`MAINTENANCE_DUE`). The scan of one organisation runs in one `withSyncTx` through
 * `maintenance.runDueScan` in `@agrorende/core`, so the work order, its outbox events and the
 * notifications commit together; a second run finds the open job and creates nothing.
 */

export interface DueScanOrg {
  readonly id: string;
  readonly timeZone: string | undefined;
  readonly settings: unknown;
}

export interface DueScanOrgResult {
  readonly plans: number;
  readonly created: readonly unknown[];
}

export interface DueScanDeps {
  readonly runOrg: (org: DueScanOrg, now: Date) => Promise<DueScanOrgResult>;
}

export interface DueScanSummary {
  readonly orgs: number;
  readonly plans: number;
  readonly created: number;
  readonly failed: number;
}

interface MaintenanceModule {
  runDueScan(tx: unknown, now: Date, options: { timeZone?: string; orgSettings?: unknown }): Promise<DueScanOrgResult>;
}

/** Production dependencies: the shared database client and the core maintenance service. */
export const defaultDueScanDeps: DueScanDeps = {
  runOrg: async (org, now) => {
    const [dbModule, maintenance] = await Promise.all([
      loadDbModule(),
      import("@agrorende/core/modules/maintenance/service") as unknown as Promise<MaintenanceModule>,
    ]);
    const db = await dbModule.getDb();
    return dbModule.withSyncTx(
      { orgId: org.id },
      (tx) => maintenance.runDueScan(tx, now, { ...(org.timeZone === undefined ? {} : { timeZone: org.timeZone }), orgSettings: org.settings }),
      db,
    );
  },
};

export async function scanAll(ctx: JobContext, deps: DueScanDeps): Promise<DueScanSummary> {
  const orgs = await ctx.platform
    .table("organizations")
    .find({ status: { $nin: ["SUSPENDED", "CANCELLED"] }, deletedAt: null }, { projection: { _id: 1, timezone: 1, settings: 1 } })
    .toArray();
  let plans = 0;
  let created = 0;
  let failed = 0;
  for (const org of orgs as Doc[]) {
    const orgId = String(org._id);
    try {
      const result = await deps.runOrg({ id: orgId, timeZone: readString(org, "timezone"), settings: org.settings }, ctx.now);
      plans += result.plans;
      created += result.created.length;
    } catch (error) {
      failed += 1;
      ctx.logger.error("maintenance.due_scan.org_failed", { orgId, errorName: error instanceof Error ? error.name : "unknown" });
    }
  }
  const summary: DueScanSummary = { orgs: orgs.length, plans, created, failed };
  ctx.logger.info("maintenance.due_scan", { ...summary });
  return summary;
}

export function createDueScanHandler(deps: DueScanDeps = defaultDueScanDeps): JobHandler {
  return (ctx) => scanAll(ctx, deps);
}

export const handler: JobHandler = createDueScanHandler();
