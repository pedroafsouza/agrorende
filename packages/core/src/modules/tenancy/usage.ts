import { collections, getDb, type OrgUsage } from "@agrorende/db";

import type { OrgUsageDTO } from "./dto.js";

export type Db = Awaited<ReturnType<typeof getDb>>;

/** `YYYY-MM-01` of `now` in the organisation's timezone. */
export function usageMonth(now: Date, timezone: string): string {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit" }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit" }).formatToParts(now);
  }
  const year = parts.find((part) => part.type === "year")?.value ?? String(now.getUTCFullYear());
  const month = parts.find((part) => part.type === "month")?.value ?? String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

function monthStart(month: string): Date {
  return new Date(`${month}T00:00:00.000Z`);
}

export interface UsageCounts {
  readonly activeFieldUsers: number;
  readonly officeUsers: number;
  readonly storageBytes: number;
  readonly assetCount: number;
}

/**
 * Counts one organisation's usage for the month (TEN-05): FIELD users seen or synced this month,
 * active ADMIN/MANAGER users, stored media bytes and live assets.
 */
export async function computeUsage(db: Db, organizationId: string, month: string): Promise<UsageCounts> {
  const since = monthStart(month);
  const users = collections.users(db);
  const [seenField, syncedDevices, officeUsers, storage, assetCount] = await Promise.all([
    users
      .find({ organizationId, role: "FIELD", deletedAt: null, isActive: true, lastSeenAt: { $gte: since } }, { projection: { _id: 1 } })
      .toArray(),
    collections.devices(db).find({ organizationId, lastSyncAt: { $gte: since } }, { projection: { userId: 1 } }).toArray(),
    users.countDocuments({ organizationId, role: { $in: ["ADMIN", "MANAGER"] }, deletedAt: null, isActive: true }),
    collections
      .media(db)
      .aggregate<{ total: number }>([
        { $match: { organizationId, deletedAt: null } },
        { $group: { _id: null, total: { $sum: { $ifNull: ["$sizeBytes", 0] } } } },
      ])
      .toArray(),
    collections.assets(db).countDocuments({ organizationId, deletedAt: null }),
  ]);
  const deviceUserIds = [...new Set(syncedDevices.map((device) => String(device.userId)))];
  const syncedField = deviceUserIds.length === 0
    ? []
    : await users.find({ organizationId, _id: { $in: deviceUserIds }, role: "FIELD", deletedAt: null, isActive: true }, { projection: { _id: 1 } }).toArray();
  const active = new Set([...seenField, ...syncedField].map((user) => user._id));
  return { activeFieldUsers: active.size, officeUsers, storageBytes: Math.max(0, Math.round(storage[0]?.total ?? 0)), assetCount };
}

/** Idempotent upsert of the `OrgUsage` row `${orgId}:${month}`. */
export async function recordUsage(db: Db, organizationId: string, month: string, now: Date): Promise<OrgUsage> {
  const counts = await computeUsage(db, organizationId, month);
  const id = `${organizationId}:${month}`;
  await collections.orgUsage(db).updateOne(
    { _id: id },
    { $set: { ...counts, updatedAt: now }, $setOnInsert: { organizationId, month } },
    { upsert: true },
  );
  return { _id: id, organizationId, month, ...counts, updatedAt: now };
}

/** `usage.daily`: refreshes the current month's row of every organisation that still has data. */
export async function runUsageDaily(now: Date, dbOverride?: Db): Promise<{ organizations: number }> {
  const db = dbOverride ?? (await getDb());
  const orgs = await collections.organizations(db).find({}, { projection: { _id: 1, timezone: 1 } }).toArray();
  for (const org of orgs) {
    await recordUsage(db, org._id, usageMonth(now, org.timezone), now);
  }
  return { organizations: orgs.length };
}

export function usageDto(row: OrgUsage): OrgUsageDTO {
  return {
    month: row.month,
    activeFieldUsers: row.activeFieldUsers,
    officeUsers: row.officeUsers,
    storageBytes: row.storageBytes,
    assetCount: row.assetCount,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Usage history of exactly one organisation, newest month first. Callers pass their own org id only. */
export async function readUsage(organizationId: string, months = 6, dbOverride?: Db): Promise<OrgUsageDTO[]> {
  const db = dbOverride ?? (await getDb());
  const rows = await collections.orgUsage(db).find({ organizationId }).sort({ month: -1 }).limit(months).toArray();
  return rows.map(usageDto);
}
