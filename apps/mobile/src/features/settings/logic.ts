import type { SqlDb } from "../../db/sql";
import type { NavigationApp } from "../../lib/navigation";
import { outboxCounts } from "../../sync/outbox";
import { readSyncState, SYNC_STATE_KEYS, writeSyncState } from "../../sync/state";

export interface UserSettings {
  readonly navApp: NavigationApp | undefined;
  readonly wifiOnlyVideo: boolean;
}

export async function loadUserSettings(db: SqlDb): Promise<UserSettings> {
  const navApp = (await readSyncState(db, SYNC_STATE_KEYS.navApp)) as NavigationApp | undefined;
  const wifiOnlyVideo = (await readSyncState(db, SYNC_STATE_KEYS.wifiOnlyVideo)) !== "false";
  return { navApp, wifiOnlyVideo };
}

export async function saveNavApp(db: SqlDb, app: NavigationApp): Promise<void> {
  await writeSyncState(db, SYNC_STATE_KEYS.navApp, app);
}

export async function saveWifiOnlyVideo(db: SqlDb, value: boolean): Promise<void> {
  await writeSyncState(db, SYNC_STATE_KEYS.wifiOnlyVideo, value ? "true" : "false");
}

/**
 * Items still waiting to send (commands plus media). Sign-out and account deletion are guarded by
 * this count (LOGOUT_PENDING_DATA, ACCOUNT_DELETE_PENDING_DATA): nothing is ever discarded silently.
 */
export async function pendingItemCount(db: SqlDb): Promise<number> {
  const counts = await outboxCounts(db);
  const media = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM media_files WHERE state IN ('QUEUED', 'UPLOADING', 'UPLOADED', 'FAILED')");
  return counts.pending + counts.rejected + Number(media?.n ?? 0);
}

/** The delete confirmation phrase must be typed exactly (§7.9 account deletion). */
export function deleteConfirmationMatches(typed: string, expected: string): boolean {
  return typed.trim().toLocaleUpperCase() === expected.trim().toLocaleUpperCase();
}
