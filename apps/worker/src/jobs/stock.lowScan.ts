import { lowStockEntries } from "@agrorende/core/modules/parts/low";

import { DAY_MS, readString, type Doc, type JobContext, type JobHandler } from "./index.js";

/**
 * `stock.lowScan` (ARCHITECTURE §10, ERP-05): hourly, finds stock levels at or below the part's
 * `minStock` and notifies ADMIN and MANAGER (`LOW_STOCK`). Each part and location is announced at
 * most once per organisation-local day: the claim is a Redis `SET NX` with a two-day expiry, so
 * overlapping or repeated runs never notify twice the same day.
 */

export const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

export interface LowScanSummary {
  readonly orgs: number;
  readonly low: number;
  readonly notified: number;
}

/** Calendar day of `at` in the organisation's time zone (`YYYY-MM-DD`). */
export function localDay(at: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  }
}

export function lowStockKey(prefix: string, orgId: string, partId: string, locationId: string, day: string): string {
  return `${prefix}:lowStock:${orgId}:${partId}:${locationId}:${day}`;
}

async function officeIds(ctx: JobContext, orgId: string): Promise<string[]> {
  const rows = await ctx.platform
    .table("users")
    .find({ organizationId: orgId, role: { $in: ["ADMIN", "MANAGER"] }, isActive: true, deletedAt: null }, { projection: { _id: 1 } })
    .toArray();
  return rows.map((row) => String(row._id));
}

/** Scans one organisation; returns how many low levels it found and announced. */
export async function scanOrg(ctx: JobContext, org: Doc): Promise<{ low: number; notified: number }> {
  const orgId = String(org._id);
  const parts = await ctx.platform
    .table("parts")
    .find({ organizationId: orgId, deletedAt: null, isActive: true, archivedAt: null, minStock: { $ne: null } }, { projection: { _id: 1, name: 1, sku: 1, minStock: 1, isActive: 1, archivedAt: 1 } })
    .toArray();
  if (parts.length === 0) return { low: 0, notified: 0 };
  const levels = await ctx.platform
    .table("stock_levels")
    .find({ organizationId: orgId, deletedAt: null, partId: { $in: parts.map((part) => String(part._id)) } }, { projection: { partId: 1, stockLocationId: 1, quantity: 1 } })
    .toArray();
  const locations = await ctx.platform.table("stock_locations").find({ organizationId: orgId, deletedAt: null }, { projection: { _id: 1, name: 1 } }).toArray();
  const entries = lowStockEntries(
    parts.map((part) => ({
      _id: String(part._id),
      name: readString(part, "name") ?? "",
      sku: readString(part, "sku") ?? "",
      minStock: typeof part.minStock === "number" ? part.minStock : null,
    })),
    locations.map((location) => ({ _id: String(location._id), name: readString(location, "name") ?? "" })),
    levels.map((level) => ({ partId: String(level.partId), stockLocationId: String(level.stockLocationId), quantity: Number(level.quantity ?? 0) })),
  );
  const day = localDay(ctx.now, readString(org, "timezone") ?? DEFAULT_TIME_ZONE);
  let notified = 0;
  let office: string[] | null = null;
  for (const entry of entries) {
    const key = lowStockKey(ctx.platform.keyPrefix, orgId, entry.partId, entry.stockLocationId, day);
    if ((await ctx.platform.redis.set(key, "1", "PX", 2 * DAY_MS, "NX")) !== "OK") continue;
    office ??= await officeIds(ctx, orgId);
    if (office.length === 0) continue;
    await ctx.platform.notify(orgId, {
      type: "LOW_STOCK",
      userIds: office,
      entity: { entityType: "PART", entityId: entry.partId },
      params: { title: `${entry.partName} · ${entry.locationName}` },
    });
    notified += 1;
  }
  return { low: entries.length, notified };
}

export const handler: JobHandler = async (ctx) => {
  const orgs = await ctx.platform
    .table("organizations")
    .find({ status: { $nin: ["SUSPENDED", "CANCELLED"] }, deletedAt: null }, { projection: { _id: 1, timezone: 1 } })
    .toArray();
  let low = 0;
  let notified = 0;
  for (const org of orgs) {
    const result = await scanOrg(ctx, org);
    low += result.low;
    notified += result.notified;
  }
  const summary: LowScanSummary = { orgs: orgs.length, low, notified };
  ctx.logger.info("stock.low_scan", { ...summary });
  return summary;
};
