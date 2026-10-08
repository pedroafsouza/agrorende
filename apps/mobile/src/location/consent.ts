import type { SqlDb } from "../db/sql";
import { readSyncState, SYNC_STATE_KEYS, writeSyncState } from "../sync/state";

/** Location is shared only while ON_DUTY and after explicit consent (PLT-04). */
export async function hasLocationConsent(db: SqlDb): Promise<boolean> {
  return (await readSyncState(db, SYNC_STATE_KEYS.locationConsent)) !== undefined;
}

export async function recordLocationConsent(db: SqlDb, nowIso: string): Promise<void> {
  await writeSyncState(db, SYNC_STATE_KEYS.locationConsent, nowIso);
}

export function shouldTrack(input: { readonly dutyStatus: string | null | undefined; readonly consent: boolean; readonly signedIn: boolean }): boolean {
  return input.signedIn && input.consent && input.dutyStatus === "ON_DUTY";
}
