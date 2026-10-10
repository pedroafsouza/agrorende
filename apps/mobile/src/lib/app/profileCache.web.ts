import type { CachedProfile } from "../../auth/session";
import { readWebJson, writeWebJson } from "./webStorage";

/** Web variant of `profileCache.ts` (development web preview only): profiles live in localStorage. */
export async function loadCachedProfile(userId: string): Promise<CachedProfile | undefined> {
  return readWebJson<CachedProfile>(`profiles.${userId.replace(/[^A-Za-z0-9-]/g, "")}`);
}

export async function saveCachedProfile(profile: CachedProfile): Promise<void> {
  writeWebJson(`profiles.${profile.user.id.replace(/[^A-Za-z0-9-]/g, "")}`, profile);
}
