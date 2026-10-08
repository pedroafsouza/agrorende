import type { Priority, WorkOrderStatus } from "@agrorende/contracts/enums";
import { SLA_OPEN_STATUSES, slaNotificationDue, slaSettingsOf } from "@agrorende/core/modules/workOrders/sla";

import { readString, type Doc, type JobContext, type JobHandler } from "./index.js";

/**
 * `workOrders.slaScan` (ARCHITECTURE §6.4 and §10, EC-WO-17): every five minutes, finds open
 * work orders that entered the at-risk band or passed their due date and notifies the office
 * and the assignee once per state. The one-shot flags `slaAtRiskNotifiedAt` and `slaBreachedAt`
 * are claimed with a conditional update, so overlapping runs never notify twice.
 */

export interface SlaScanSummary {
  readonly orgs: number;
  readonly atRisk: number;
  readonly breached: number;
}

async function officeIds(ctx: JobContext, orgId: string): Promise<string[]> {
  const rows = await ctx.platform
    .collection("users")
    .find({ organizationId: orgId, role: { $in: ["ADMIN", "MANAGER"] }, isActive: true, deletedAt: null }, { projection: { _id: 1 } })
    .toArray();
  return rows.map((row) => String(row._id));
}

/** Scans one organisation; returns how many work orders were flagged. */
export async function scanOrg(ctx: JobContext, org: Doc): Promise<{ atRisk: number; breached: number }> {
  const orgId = String(org._id);
  const settings = slaSettingsOf(org.settings);
  const rows = await ctx.platform
    .collection("work_orders")
    .find(
      {
        organizationId: orgId,
        deletedAt: null,
        status: { $in: [...SLA_OPEN_STATUSES] },
        dueAt: { $ne: null },
        slaBreachedAt: null,
      },
      { projection: { _id: 1, number: 1, title: 1, status: 1, priority: 1, dueAt: 1, createdAt: 1, assigneeId: 1, slaAtRiskNotifiedAt: 1, slaBreachedAt: 1 } },
    )
    .toArray();
  let atRisk = 0;
  let breached = 0;
  let office: string[] | null = null;
  for (const row of rows) {
    const due = slaNotificationDue(
      {
        status: row.status as WorkOrderStatus,
        priority: row.priority as Priority,
        dueAt: row.dueAt instanceof Date ? row.dueAt : null,
        createdAt: row.createdAt instanceof Date ? row.createdAt : ctx.now,
        slaAtRiskNotifiedAt: row.slaAtRiskNotifiedAt instanceof Date ? row.slaAtRiskNotifiedAt : null,
        slaBreachedAt: row.slaBreachedAt instanceof Date ? row.slaBreachedAt : null,
      },
      ctx.now,
      settings,
    );
    if (due === null) continue;
    const field = due === "BREACHED" ? "slaBreachedAt" : "slaAtRiskNotifiedAt";
    const syncVersion = await ctx.platform.nextSyncVersion(orgId);
    const claimed = await ctx.platform.collection("work_orders").updateOne(
      { _id: row._id, organizationId: orgId, [field]: null },
      { $set: { [field]: ctx.now, ...(due === "BREACHED" && row.slaAtRiskNotifiedAt == null ? { slaAtRiskNotifiedAt: ctx.now } : {}), syncVersion, updatedAt: ctx.now } },
    );
    if (claimed.modifiedCount === 0) continue;
    if (due === "BREACHED") breached += 1;
    else atRisk += 1;
    office ??= await officeIds(ctx, orgId);
    const assigneeId = readString(row, "assigneeId");
    const userIds = [...new Set([...office, ...(assigneeId === undefined ? [] : [assigneeId])])];
    if (userIds.length === 0) continue;
    await ctx.platform.notify(orgId, {
      type: "SLA_AT_RISK",
      userIds,
      entity: { entityType: "WORK_ORDER", entityId: String(row._id) },
      params: { title: `${readString(row, "number") ?? ""} · ${readString(row, "title") ?? ""}` },
    });
  }
  return { atRisk, breached };
}

export const handler: JobHandler = async (ctx) => {
  const orgs = await ctx.platform
    .collection("organizations")
    .find({ status: { $nin: ["SUSPENDED", "CANCELLED"] }, deletedAt: null }, { projection: { _id: 1, settings: 1 } })
    .toArray();
  let atRisk = 0;
  let breached = 0;
  for (const org of orgs) {
    const result = await scanOrg(ctx, org);
    atRisk += result.atRisk;
    breached += result.breached;
  }
  const summary: SlaScanSummary = { orgs: orgs.length, atRisk, breached };
  ctx.logger.info("workOrders.sla_scan", { ...summary });
  return summary;
};
