import type { SqlDb } from "../db/sql";
import { mediaCounts } from "../sync/deviceStatus";
import { outboxCounts } from "../sync/outbox";
import type { CachedProfile } from "./session";

export interface DeviceUser {
  readonly userId: string;
  readonly name: string;
  /** Commands and uploads still waiting to send, or null when the database could not be read. */
  readonly pending: number | null;
}

export interface DeviceUserSources {
  /** Profiles cached next to each per-user database (one per user who signed in here). */
  readonly listProfiles: () => Promise<readonly CachedProfile[]>;
  /** Runs `read` against that user's own database without opening a sync session. */
  readonly withUserDb: <T>(userId: string, read: (db: SqlDb) => Promise<T>) => Promise<T | undefined>;
}

/** Commands in the outbox plus media files still to upload, counted inside one user's database. */
export async function countPendingWork(db: SqlDb): Promise<number> {
  const [outbox, media] = await Promise.all([outboxCounts(db), mediaCounts(db)]);
  return outbox.pending + outbox.rejected + media.pending;
}

/**
 * Users with data on this phone and their pending counts (PLT-12, shared devices). Each count is
 * read from that user's own SQLite file, so one user's work is never shown or sent as another's.
 */
export async function listDeviceUsers(sources: DeviceUserSources): Promise<DeviceUser[]> {
  const profiles = await sources.listProfiles();
  const users = await Promise.all(
    profiles.map(async (profile): Promise<DeviceUser> => {
      const pending = await sources.withUserDb(profile.user.id, countPendingWork).catch(() => undefined);
      return { userId: profile.user.id, name: profile.user.name, pending: pending ?? null };
    }),
  );
  return users.sort((a, b) => a.name.localeCompare(b.name));
}
