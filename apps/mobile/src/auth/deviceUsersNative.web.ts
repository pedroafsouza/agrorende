import { getUserSession } from "../lib/app/session";
import { listWebJson } from "../lib/app/webStorage";
import type { DeviceUserSources } from "./deviceUsers";
import type { CachedProfile } from "./session";

/**
 * Web variant of `deviceUsersNative.ts` (development web preview only). Profiles come from
 * localStorage; only the signed-in user's database is readable, other users show no count.
 */
async function listProfiles(): Promise<CachedProfile[]> {
  return listWebJson<CachedProfile>("profiles.").filter((profile) => typeof profile.user?.id === "string" && typeof profile.user.name === "string");
}

async function withUserDb<T>(userId: string, read: Parameters<DeviceUserSources["withUserDb"]>[1]): Promise<T | undefined> {
  const active = getUserSession();
  if (active?.userId === userId) return read(active.db) as Promise<T>;
  return undefined;
}

export const nativeDeviceUserSources: DeviceUserSources = { listProfiles, withUserDb };
