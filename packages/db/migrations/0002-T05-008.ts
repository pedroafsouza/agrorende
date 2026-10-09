import type { Db } from "mongodb";

export const id = "0002-T05-008";

/** Change request T05-008: every user gets the default push mute settings. */
export async function up(db: Db): Promise<void> {
  await db.collection("users").updateMany({ notificationPrefs: { $exists: false } }, { $set: { notificationPrefs: { pushMuted: false, mutedTypes: [] } } });
}
