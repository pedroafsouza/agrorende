import { Directory, File, Paths } from "expo-file-system";

import { userDatabaseFileName } from "../db/client";
import { expoDatabaseHost } from "../db/expoDriver";
import { createSqlDb } from "../db/sql";
import { getUserSession } from "../lib/app/session";
import type { DeviceUserSources } from "./deviceUsers";
import type { CachedProfile } from "./session";

/** Profiles live in `Documents/profiles/<userId>.json`, written by `lib/app/profileCache`. */
async function listProfiles(): Promise<CachedProfile[]> {
  const dir = new Directory(Paths.document, "profiles");
  if (!dir.exists) return [];
  const profiles: CachedProfile[] = [];
  for (const entry of dir.list()) {
    if (!(entry instanceof File) || !entry.name.endsWith(".json")) continue;
    try {
      const parsed = JSON.parse(await entry.text()) as CachedProfile;
      if (typeof parsed.user?.id === "string" && typeof parsed.user.name === "string") profiles.push(parsed);
    } catch (_error) {
      // A damaged profile file only hides that user from the list; their database is untouched.
    }
  }
  return profiles;
}

/**
 * Reads another user's SQLite file directly (no migrations, no sync). The active user's database is
 * reused instead of being opened twice; a user without a database file is skipped.
 */
async function withUserDb<T>(userId: string, read: (db: ReturnType<typeof createSqlDb>) => Promise<T>): Promise<T | undefined> {
  const active = getUserSession();
  if (active?.userId === userId) return read(active.db);
  const fileName = userDatabaseFileName(userId);
  if (!new File(Paths.document, "SQLite", fileName).exists) return undefined;
  const db = createSqlDb(await expoDatabaseHost.open(fileName));
  try {
    return await read(db);
  } finally {
    await db.close();
  }
}

export const nativeDeviceUserSources: DeviceUserSources = { listProfiles, withUserDb };
