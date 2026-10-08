import { Directory, File, Paths } from "expo-file-system";

import type { CachedProfile } from "../../auth/session";

function profileFile(userId: string): File {
  const dir = new Directory(Paths.document, "profiles");
  if (!dir.exists) dir.create({ intermediates: true });
  return new File(dir, `${userId.replace(/[^A-Za-z0-9-]/g, "")}.json`);
}

/** Cached user + org next to the per-user DB so the app opens offline (§7.9). */
export async function loadCachedProfile(userId: string): Promise<CachedProfile | undefined> {
  const file = profileFile(userId);
  if (!file.exists) return undefined;
  try {
    return JSON.parse(await file.text()) as CachedProfile;
  } catch (_error) {
    return undefined;
  }
}

export async function saveCachedProfile(profile: CachedProfile): Promise<void> {
  const file = profileFile(profile.user.id);
  await file.write(JSON.stringify(profile));
}
