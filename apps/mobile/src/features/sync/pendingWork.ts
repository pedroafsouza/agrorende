import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import type { SqlDb } from "../../db/sql";
import { message } from "../../i18n";
import type { AppServices } from "../../lib/services";
import { bumpLocalData } from "../../lib/useLocalQuery";
import { allowMobileDataForAll } from "../../media/queue";
import { collectPendingWork, type PendingWorkHandoff } from "../../sync/handoff";

/**
 * "Enviar agora" (Settings → Conta, ACCOUNT_DELETE_PENDING_DATA, change request T12-002): lets the
 * waiting media use mobile data this once, then runs a full sync cycle. The Wi-Fi-only setting
 * itself is unchanged.
 */
export async function sendEverythingNow(services: Pick<AppServices, "db" | "syncNow">): Promise<void> {
  if (services.db !== undefined) await allowMobileDataForAll(services.db);
  bumpLocalData();
  await services.syncNow?.();
}

/** File name of the shared copy; the timestamp keeps several copies apart. */
export function pendingWorkFileName(handoff: Pick<PendingWorkHandoff, "exportedAt">): string {
  return `agrorende-pendentes-${handoff.exportedAt.replace(/[^0-9]/gu, "").slice(0, 14)}.json`;
}

/**
 * "Salvar cópia" (EC-SYN-12, EC-SYN-13, EC-PLT-42): writes the read-only pending-work manifest of
 * `collectPendingWork` to the cache folder and opens the system share sheet. The manifest lists
 * the local media files by path; nothing is deleted or uploaded.
 */
export async function savePendingWorkCopy(db: SqlDb, userId: string, now: Date = new Date()): Promise<PendingWorkHandoff> {
  const handoff = await collectPendingWork(db, { userId, nowIso: now.toISOString() });
  const file = new File(Paths.cache, pendingWorkFileName(handoff));
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(handoff, null, 2));
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: message("sync.copy.title"), UTI: "public.json" });
  }
  return handoff;
}
