import type { SqlDb } from "../db/sql";

/** Keys stored in `sync_state`. */
export const SYNC_STATE_KEYS = {
  cursor: "cursor",
  scopeEpoch: "scopeEpoch",
  lastSyncAt: "lastSyncAt",
  serverOffsetMs: "serverOffsetMs",
  firstSyncDone: "firstSyncDone",
  launchedRuntime: "launchedRuntime",
  locationConsent: "locationConsent",
  dutyStatus: "dutyStatus",
  crashResume: "crashResume",
  wifiOverride: "wifiOverride",
  navApp: "navApp",
  officeContact: "officeContact",
  recentAssets: "recentAssets",
  wifiOnlyVideo: "wifiOnlyVideo",
} as const;

export async function readSyncState(db: SqlDb, key: string): Promise<string | undefined> {
  const row = await db.get<{ value: string }>("SELECT value FROM sync_state WHERE key = ?", [key]);
  return row?.value;
}

export async function writeSyncState(db: SqlDb, key: string, value: string): Promise<void> {
  await db.run("INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [key, value]);
}

export async function deleteSyncState(db: SqlDb, key: string): Promise<void> {
  await db.run("DELETE FROM sync_state WHERE key = ?", [key]);
}
