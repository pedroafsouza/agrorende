import { dueSoonFilter, overdueFilter } from "@agrorende/core/modules/rentals/overdue";

import { readNumber, readString, type Doc, type JobContext, type JobHandler } from "./index.js";

/**
 * `rentals.overdueScan` (ARCHITECTURE §7.4 and §10, EC-RN-20): every five minutes, finds ACTIVE
 * rentals that are about to end (`rentalDueSoonHours`) or are past `plannedEnd + rentalGraceHours`,
 * and notifies the rental's agent plus the office (ADMIN and MANAGER) once per state. The one-shot
 * flags `dueSoonNotifiedAt` and `overdueNotifiedAt` are claimed with a conditional update, so
 * overlapping runs never notify twice. Extending a rental clears both flags.
 */

export const DEFAULT_GRACE_HOURS = 2;
export const DEFAULT_DUE_SOON_HOURS = 24;

export interface OverdueScanSummary {
  readonly orgs: number;
  readonly dueSoon: number;
  readonly overdue: number;
}

function hours(settings: unknown, key: string, fallback: number): number {
  if (settings === null || typeof settings !== "object") return fallback;
  const value = readNumber(settings as Doc, key);
  return value !== undefined && value >= 0 ? value : fallback;
}

async function officeIds(ctx: JobContext, orgId: string): Promise<string[]> {
  const rows = await ctx.platform
    .table("users")
    .find({ organizationId: orgId, role: { $in: ["ADMIN", "MANAGER"] }, isActive: true, deletedAt: null }, { projection: { _id: 1 } })
    .toArray();
  return rows.map((row) => String(row._id));
}

async function titleOf(ctx: JobContext, orgId: string, row: Doc): Promise<string> {
  const assetId = readString(row, "assetId");
  const asset = assetId === undefined ? null : await ctx.platform.table("assets").findOne({ _id: assetId, organizationId: orgId }, { projection: { code: 1 } });
  const code = asset === null ? undefined : readString(asset, "code");
  const number = readString(row, "number") ?? "";
  return code === undefined ? number : `${number} · ${code}`;
}

/** Scans one organisation; returns how many rentals were flagged in each state. */
export async function scanOrg(ctx: JobContext, org: Doc): Promise<{ dueSoon: number; overdue: number }> {
  const orgId = String(org._id);
  const graceHours = hours(org.settings, "rentalGraceHours", DEFAULT_GRACE_HOURS);
  const dueSoonHours = hours(org.settings, "rentalDueSoonHours", DEFAULT_DUE_SOON_HOURS);
  const projection = { _id: 1, number: 1, assetId: 1, agentId: 1, plannedEnd: 1 };
  const states = [
    { type: "RENTAL_OVERDUE" as const, field: "overdueNotifiedAt", filter: overdueFilter(ctx.now, graceHours) },
    { type: "RENTAL_DUE_SOON" as const, field: "dueSoonNotifiedAt", filter: dueSoonFilter(ctx.now, dueSoonHours, graceHours) },
  ];
  const counts = { dueSoon: 0, overdue: 0 };
  let office: string[] | null = null;
  for (const state of states) {
    const rows = await ctx.platform
      .table("rentals")
      .find({ ...state.filter, organizationId: orgId, [state.field]: null }, { projection })
      .toArray();
    for (const row of rows) {
      const syncVersion = await ctx.platform.nextSyncVersion(orgId);
      const set: Doc = { [state.field]: ctx.now, syncVersion, updatedAt: ctx.now };
      // An overdue rental never needs the due-soon reminder afterwards.
      if (state.type === "RENTAL_OVERDUE") set.dueSoonNotifiedAt = row.dueSoonNotifiedAt ?? ctx.now;
      const claimed = await ctx.platform.table("rentals").updateOne({ _id: row._id, organizationId: orgId, [state.field]: null }, { $set: set });
      if (claimed.modifiedCount === 0) continue;
      if (state.type === "RENTAL_OVERDUE") counts.overdue += 1;
      else counts.dueSoon += 1;
      office ??= await officeIds(ctx, orgId);
      const agentId = readString(row, "agentId");
      const userIds = [...new Set([...office, ...(agentId === undefined ? [] : [agentId])])];
      if (userIds.length === 0) continue;
      await ctx.platform.notify(orgId, {
        type: state.type,
        userIds,
        entity: { entityType: "RENTAL", entityId: String(row._id) },
        params: { title: await titleOf(ctx, orgId, row) },
      });
    }
  }
  return counts;
}

export const handler: JobHandler = async (ctx) => {
  const orgs = await ctx.platform
    .table("organizations")
    .find({ status: { $nin: ["SUSPENDED", "CANCELLED"] }, deletedAt: null }, { projection: { _id: 1, settings: 1 } })
    .toArray();
  let dueSoon = 0;
  let overdue = 0;
  for (const org of orgs) {
    const result = await scanOrg(ctx, org);
    dueSoon += result.dueSoon;
    overdue += result.overdue;
  }
  const summary: OverdueScanSummary = { orgs: orgs.length, dueSoon, overdue };
  ctx.logger.info("rentals.overdue_scan", { ...summary });
  return summary;
};
