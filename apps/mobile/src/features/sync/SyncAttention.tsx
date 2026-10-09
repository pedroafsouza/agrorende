import type { AppErrorCode } from "@agrorende/contracts/errors";
import { useState } from "react";

import { authStore } from "../../auth/session";
import { useServices } from "../../lib/services";
import { useLocalQuery } from "../../lib/useLocalQuery";
import { syncAttention, type AttentionItem } from "../../sync/attention";
import { showToast, useSyncSnapshot } from "../../ui";
import { ErrorBanner } from "../../ui/recovery";
import { savePendingWorkCopy, sendEverythingNow } from "./pendingWork";

/** Wall-clock start of this app process: no sync finished since then means a cold start (EC-SYN-30). */
const PROCESS_STARTED_AT = Date.now();

/** Codes the Home screen repeats; the rest belong to Sync Center only (ERRORS.md "surface"). */
export const HOME_ATTENTION_CODES: ReadonlySet<AppErrorCode> = new Set<AppErrorCode>(["OUTBOX_BACKLOG", "DEVICE_UNSYNCED_STALE", "LOCATION_BUFFER_TRIMMED"]);

/**
 * Client-side attention codes for Sync Center and the Home banner (change request T12-002):
 * `syncAttention` over the local database, re-read after every sync or local write.
 */
export function useSyncAttention(): readonly AttentionItem[] {
  const snapshot = useSyncSnapshot();
  const coldStart = snapshot.lastSyncAt === undefined || Date.parse(snapshot.lastSyncAt) < PROCESS_STARTED_AT;
  const query = useLocalQuery(
    (db) => syncAttention(db, { nowMs: Date.now(), snapshot, locationTrimmed: snapshot.locationTrimmed, coldStart }),
    [snapshot.lastError, snapshot.network, snapshot.slowLink, snapshot.firstSyncDone, snapshot.locationTrimmed, coldStart],
  );
  return query.status === "ready" ? query.data : [];
}

export type SyncAttentionBannersProps = {
  /** Only these codes are shown; all codes when omitted. */
  readonly only?: ReadonlySet<AppErrorCode>;
  /** Codes already shown by the screen (for example the last cycle error). */
  readonly exclude?: ReadonlySet<string>;
};

/** One recovery banner per attention code, with the catalog actions (`useRecovery`). */
export function SyncAttentionBanners({ only, exclude }: SyncAttentionBannersProps) {
  const services = useServices();
  const items = useSyncAttention().filter((item) => (only === undefined || only.has(item.code)) && exclude?.has(item.code) !== true);
  const [dismissed, setDismissed] = useState<ReadonlySet<AppErrorCode>>(new Set());

  const retry = () => {
    void services.syncNow?.();
  };
  const handoff = () => {
    const userId = services.userId ?? authStore.getState().user?.id;
    if (services.db === undefined || userId === undefined) return;
    savePendingWorkCopy(services.db, userId).catch(() => showToast({ messageKey: "sync.copy.failed", tone: "danger" }));
  };
  const allowMobileData = () => {
    void sendEverythingNow(services);
  };

  return (
    <>
      {items
        .filter((item) => !dismissed.has(item.code))
        .map((item) => (
          <ErrorBanner
            key={item.code}
            code={item.code}
            tone={item.code === "UPLOAD_RESUME_AFTER_RESTART" ? "info" : "warning"}
            handlers={{ retry, handoff, ...(item.code === "WIFI_ONLY_MEDIA_WAITING" ? { alt: allowMobileData } : {}) }}
            onDismiss={() => setDismissed((previous) => new Set([...previous, item.code]))}
          />
        ))}
    </>
  );
}
