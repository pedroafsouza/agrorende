import type { SqlDb } from "../../db/sql";
import { getMirrorRow, listMirrorRows, type MirrorRow } from "../../db/mirror";
import { LocalError } from "../../lib/errors";
import { readSyncState, SYNC_STATE_KEYS, writeSyncState } from "../../sync/state";

export interface AssetSummary {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly category: string;
  readonly condition: string;
  readonly plate: string | null;
  readonly serialNumber: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly distanceM?: number;
}

const QR_PREFIX = /^(?:agrorende(?:-dev|-preview)?:\/\/a\/|https?:\/\/[^/]+\/a\/)/i;

/** QR payload `agrorende://a/<code>` (or a printed code / serial / plate) → lookup token. */
export function parseScanCode(data: string): string {
  const trimmed = data.trim();
  if (trimmed.length === 0) throw new LocalError("SCAN_UNREADABLE");
  const token = trimmed.replace(QR_PREFIX, "").split(/[?#]/)[0] ?? "";
  if (token.length === 0) throw new LocalError("SCAN_UNREADABLE");
  return decodeURIComponent(token);
}

function summary(row: MirrorRow): AssetSummary {
  return {
    id: String(row.id),
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    category: String(row.category ?? ""),
    condition: String(row.condition ?? "OPERATIONAL"),
    plate: typeof row.plate === "string" ? row.plate : null,
    serialNumber: typeof row.serialNumber === "string" ? row.serialNumber : null,
    lat: typeof row.lastLat === "number" ? row.lastLat : null,
    lng: typeof row.lastLng === "number" ? row.lastLng : null,
  };
}

const ACTIVE = "deletedAt IS NULL";

/** Exact match on code, serial or plate (case-insensitive); `undefined` when not in the local mirror. */
export async function findAssetByCode(db: SqlDb, token: string): Promise<AssetSummary | undefined> {
  const value = token.trim().toUpperCase();
  const rows = await listMirrorRows(db, "assets", `${ACTIVE} AND (UPPER(code) = ? OR UPPER(serialNumber) = ? OR UPPER(REPLACE(plate, '-', '')) = ?) LIMIT 1`, [value, value, value.replace(/-/g, "")]);
  const row = rows[0];
  return row === undefined ? undefined : summary(row);
}

/** Offline search on name, code, plate and serial (PLT-05). */
export async function searchAssets(db: SqlDb, query: string, limit = 50): Promise<AssetSummary[]> {
  const q = query.trim();
  if (q.length === 0) {
    const rows = await listMirrorRows(db, "assets", `${ACTIVE} ORDER BY name COLLATE NOCASE LIMIT ${limit}`);
    return rows.map(summary);
  }
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const rows = await listMirrorRows(db, "assets", `${ACTIVE} AND (name LIKE ? OR code LIKE ? OR plate LIKE ? OR serialNumber LIKE ? OR model LIKE ?) ORDER BY name COLLATE NOCASE LIMIT ${limit}`, [like, like, like, like, like]);
  return rows.map(summary);
}

export function distanceMeters(a: { readonly lat: number; readonly lng: number }, b: { readonly lat: number; readonly lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** "Near me": last known asset position, falling back to its current/home site coordinates. */
export async function nearbyAssets(db: SqlDb, here: { readonly lat: number; readonly lng: number }, limit = 30): Promise<AssetSummary[]> {
  const rows = await db.all<Record<string, unknown>>(
    `SELECT a.id, a.code, a.name, a.category, a.condition, a.plate, a.serialNumber,
            COALESCE(a.lastLat, cs.lat, hs.lat) AS lastLat, COALESCE(a.lastLng, cs.lng, hs.lng) AS lastLng
       FROM assets a
       LEFT JOIN sites cs ON cs.id = a.currentSiteId
       LEFT JOIN sites hs ON hs.id = a.homeSiteId
      WHERE a.deletedAt IS NULL AND COALESCE(a.lastLat, cs.lat, hs.lat) IS NOT NULL`,
  );
  return rows
    .map(summary)
    .map((a) => ({ ...a, distanceM: a.lat === null || a.lng === null ? Number.POSITIVE_INFINITY : distanceMeters(here, { lat: a.lat, lng: a.lng }) }))
    .sort((x, y) => x.distanceM - y.distanceM)
    .slice(0, limit);
}

export const RECENT_ASSETS_MAX = 10;

export async function recentAssetIds(db: SqlDb): Promise<string[]> {
  const raw = await readSyncState(db, SYNC_STATE_KEYS.recentAssets);
  if (raw === undefined) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch (_error) {
    return [];
  }
}

export async function rememberAsset(db: SqlDb, assetId: string): Promise<void> {
  const ids = [assetId, ...(await recentAssetIds(db)).filter((id) => id !== assetId)].slice(0, RECENT_ASSETS_MAX);
  await writeSyncState(db, SYNC_STATE_KEYS.recentAssets, JSON.stringify(ids));
}

export async function recentAssets(db: SqlDb): Promise<AssetSummary[]> {
  const ids = await recentAssetIds(db);
  const result: AssetSummary[] = [];
  for (const id of ids) {
    const row = await getMirrorRow(db, "assets", id);
    if (row !== undefined && (row.deletedAt === null || row.deletedAt === undefined)) result.push(summary(row));
  }
  return result;
}

export async function getAsset(db: SqlDb, id: string): Promise<MirrorRow | undefined> {
  return getMirrorRow(db, "assets", id);
}

export const CONDITION_TONE: Readonly<Record<string, "success" | "warning" | "info" | "danger" | "neutral">> = {
  OPERATIONAL: "success",
  NEEDS_REPAIR: "warning",
  IN_REPAIR: "info",
  OUT_OF_SERVICE: "danger",
  RETIRED: "neutral",
};

export interface AssetHistoryItem {
  readonly id: string;
  readonly kind: "report" | "job" | "rental";
  readonly number: string | null;
  readonly title: string | null;
  readonly status: string;
  readonly at: string;
}

/** Recent local history for an asset: reports, jobs and rentals, newest first (PLT-06). */
export async function assetHistory(db: SqlDb, assetId: string, limit = 20): Promise<AssetHistoryItem[]> {
  const rows = await db.all<{ id: string; kind: string; number: string | null; title: string | null; status: string; at: string }>(
    `SELECT id, 'report' AS kind, number, title, status, COALESCE(occurredAt, createdAt) AS at FROM field_reports WHERE assetId = ? AND deletedAt IS NULL
     UNION ALL SELECT id, 'job' AS kind, number, title, status, createdAt AS at FROM work_orders WHERE assetId = ? AND deletedAt IS NULL
     UNION ALL SELECT id, 'rental' AS kind, number, NULL AS title, status, COALESCE(plannedStart, createdAt) AS at FROM rentals WHERE assetId = ? AND deletedAt IS NULL
     ORDER BY at DESC LIMIT ?`,
    [assetId, assetId, assetId, limit],
  );
  return rows.map((row) => ({ ...row, kind: row.kind as AssetHistoryItem["kind"] }));
}

export type ScanPurpose = "find" | "report" | "checkout" | "checkin";

/** Where a successful scan goes for each `purpose` (ARCHITECTURE §13.1 scan route). */
export function scanDestination(purpose: ScanPurpose, assetId: string): string {
  switch (purpose) {
    case "report":
      return `/reports/new?assetId=${encodeURIComponent(assetId)}`;
    case "checkout":
      return `/rentals/new?assetId=${encodeURIComponent(assetId)}`;
    case "checkin":
    case "find":
      return `/assets/${encodeURIComponent(assetId)}`;
  }
}

export function parseScanPurpose(value: unknown): ScanPurpose {
  return value === "report" || value === "checkout" || value === "checkin" ? value : "find";
}
