import type { DeviceStatus } from "@agrorende/contracts/sync";

import type { SqlDb } from "../db/sql";
import { outboxCounts } from "./outbox";
import type { SyncRuntime } from "./runtime";
import { readSyncState, SYNC_STATE_KEYS } from "./state";

export interface MediaCounts {
  readonly pending: number;
  readonly failed: number;
  readonly pendingBytes: number;
}

export async function mediaCounts(db: SqlDb): Promise<MediaCounts> {
  const row = await db.get<{ pending: number | null; failed: number | null; bytes: number | null }>(
    "SELECT SUM(CASE WHEN state IN ('WAITING_PARENT', 'QUEUED', 'UPLOADING', 'UPLOADED') THEN 1 ELSE 0 END) AS pending, SUM(CASE WHEN state = 'FAILED' THEN 1 ELSE 0 END) AS failed, SUM(CASE WHEN state IN ('WAITING_PARENT', 'QUEUED', 'UPLOADING') THEN MAX(COALESCE(sizeBytes, 0) - bytesSent, 0) ELSE 0 END) AS bytes FROM media_files",
  );
  return { pending: Number(row?.pending ?? 0), failed: Number(row?.failed ?? 0), pendingBytes: Number(row?.bytes ?? 0) };
}

/** `deviceStatus` sent on every push (§7.3, OFF-11). */
export async function buildDeviceStatus(runtime: SyncRuntime): Promise<DeviceStatus> {
  const [outbox, media, info, epoch, offset] = await Promise.all([
    outboxCounts(runtime.db),
    mediaCounts(runtime.db),
    runtime.deviceInfo(),
    readSyncState(runtime.db, SYNC_STATE_KEYS.scopeEpoch),
    readSyncState(runtime.db, SYNC_STATE_KEYS.serverOffsetMs),
  ]);
  return {
    appVersion: info.appVersion,
    runtimeVersion: info.runtimeVersion,
    pendingMutations: outbox.pending,
    pendingUploads: media.pending,
    pendingBytes: media.pendingBytes,
    ...(outbox.oldestPendingAt === undefined ? {} : { oldestPendingAt: outbox.oldestPendingAt }),
    ...(info.batteryLevel === undefined ? {} : { batteryLevel: info.batteryLevel }),
    ...(info.freeStorageBytes === undefined ? {} : { freeStorageBytes: Math.floor(info.freeStorageBytes) }),
    scopeEpoch: Number(epoch ?? 0),
    ...(offset === undefined ? {} : { clockOffsetMs: Math.round(Number(offset)) }),
    ...(info.pushStatus === undefined ? {} : { pushStatus: info.pushStatus }),
  };
}

/** Refreshes the counters in the observable store (Home, Sync Center, badges). */
export async function refreshCounters(runtime: SyncRuntime): Promise<void> {
  const [outbox, media] = await Promise.all([outboxCounts(runtime.db), mediaCounts(runtime.db)]);
  runtime.store.setState({
    pendingMutations: outbox.pending,
    rejectedMutations: outbox.rejected,
    oldestPendingAt: outbox.oldestPendingAt,
    pendingUploads: media.pending,
    failedUploads: media.failed,
    pendingBytes: media.pendingBytes,
  });
}
