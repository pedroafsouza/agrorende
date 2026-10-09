import { ERROR_META, type AppErrorCode } from "@agrorende/contracts/errors";
import { SYNC_BACKOFF_MAX_MS, syncBackoffMs } from "@agrorende/contracts/sync";

import type { SqlDb } from "../db/sql";
import type { SyncSnapshot } from "./store";

/** EC-SYN-01: 500+ pending actions or 5 GB+ of pending media. */
export const OUTBOX_BACKLOG_ITEMS = 500;
export const OUTBOX_BACKLOG_BYTES = 5 * 1000 * 1000 * 1000;
/** EC-SYN-02, EC-SYN-25, EC-SYN-27, EC-SYN-29: the 24 h staleness window. */
export const ATTENTION_STALE_MS = 24 * 60 * 60 * 1000;
/** EC-SYN-11: a first download (or reset) above this many rows shows the phased first-sync copy. */
export const FIRST_SYNC_LARGE_ROWS = 5_000;

/** Codes the queue stores in `media_files.partsDone.error` that need the user's attention. */
const MEDIA_ATTENTION_CODES = new Set<AppErrorCode>([
  "LOCAL_MEDIA_MISSING",
  "LOCAL_MEDIA_CORRUPT",
  "MEDIA_TYPE_MISMATCH",
  "MEDIA_TOO_LARGE",
  "STORAGE_FULL",
  "UPLOAD_URL_EXPIRED",
  "MEDIA_PART_MISSING",
  "RATE_LIMITED",
]);

export interface AttentionItem {
  readonly code: AppErrorCode;
  /** How many items the message is about (rows, files or devices). */
  readonly count: number;
}

export interface AttentionInput {
  readonly nowMs: number;
  readonly snapshot?: Pick<SyncSnapshot, "lastError" | "network" | "lastSyncAt" | "slowLink" | "firstSyncDone"> & Partial<Pick<SyncSnapshot, "locationTrimmed">>;
  /** Current connection is Wi-Fi (EC-SYN-25). */
  readonly wifi?: boolean;
  /** Rows the first sync or a reset has to pull, when known from the pull pages (EC-SYN-11). */
  readonly firstSyncRows?: number;
  /** Points removed by the last `maintainLocationBuffer` run (EC-SYN-28). */
  readonly locationTrimmed?: number;
  /** Other registered devices of this user that still report pending items (EC-SYN-31). */
  readonly otherDevicesWithPending?: number;
  /** True right after a cold start, so resumed uploads are announced once (EC-SYN-30). */
  readonly coldStart?: boolean;
}

type MediaRow = {
  readonly state: string;
  readonly kind: string;
  readonly wifiOnly: number;
  readonly attempts: number;
  readonly uploadId: string | null;
  readonly partsDone: string | null;
  readonly thumbUri: string | null;
  readonly sizeBytes: number | null;
  readonly bytesSent: number;
  readonly capturedAt: string | null;
};

function progressOf(row: MediaRow): { error?: string; parts?: readonly unknown[]; thumb?: boolean } {
  if (row.partsDone === null || row.partsDone.length === 0) return {};
  try {
    return JSON.parse(row.partsDone) as { error?: string; parts?: readonly unknown[] };
  } catch (_error) {
    return {};
  }
}

function olderThan(iso: string | null | undefined, cutoffMs: number): boolean {
  if (iso === null || iso === undefined) return false;
  const at = Date.parse(iso);
  return Number.isFinite(at) && at < cutoffMs;
}

/**
 * Client-side detection for the EC-SYN codes that have no server error (ERRORS.md "client"
 * entries). Reads the local database only, so Sync Center and the Today banner can show the
 * catalog copy and recovery actions without the network. Nothing here deletes or changes data.
 */
export async function syncAttention(db: SqlDb, input: AttentionInput): Promise<AttentionItem[]> {
  const items: AttentionItem[] = [];
  const add = (code: AppErrorCode, count: number) => {
    if (count > 0 && ERROR_META[code] !== undefined) items.push({ code, count });
  };
  const staleCutoff = input.nowMs - ATTENTION_STALE_MS;

  const outbox = await db.all<{ seq: number; attempts: number; createdAt: string; status: string }>(
    "SELECT seq, attempts, createdAt, status FROM outbox WHERE status IN ('PENDING', 'IN_FLIGHT') ORDER BY seq ASC",
  );
  const media = await db.all<MediaRow>(
    `SELECT f.state, f.kind, f.wifiOnly, f.attempts, f.uploadId, f.partsDone, f.thumbUri, f.sizeBytes, f.bytesSent, m.capturedAt
       FROM media_files f LEFT JOIN media m ON m.id = f.mediaId
      WHERE f.state IN ('WAITING_PARENT', 'QUEUED', 'UPLOADING', 'UPLOADED', 'FAILED')`,
  );
  const pendingBytes = media.reduce((sum, row) => sum + Math.max(0, Number(row.sizeBytes ?? 0) - Number(row.bytesSent)), 0);

  // EC-SYN-01
  if (outbox.length >= OUTBOX_BACKLOG_ITEMS || pendingBytes >= OUTBOX_BACKLOG_BYTES) add("OUTBOX_BACKLOG", outbox.length + media.length);

  // EC-SYN-02: the head row sits at maximum backoff for over 24 h while later rows wait.
  const head = outbox[0];
  if (head !== undefined && outbox.length > 1 && syncBackoffMs(Math.max(1, Number(head.attempts))) >= SYNC_BACKOFF_MAX_MS && olderThan(head.createdAt, staleCutoff)) {
    add("OUTBOX_ITEM_STUCK", 1);
  }

  // EC-SYN-03, EC-SYN-05, EC-SYN-10 come from the last cycle.
  const lastError = input.snapshot?.lastError;
  if (lastError === "PUSH_PARTIAL_RETRY" || lastError === "PULL_FAILED") add(lastError, 1);
  if (input.snapshot?.network === "captivePortal") add("CAPTIVE_PORTAL", 1);
  if (input.snapshot?.network === "restricted") add("NETWORK_RESTRICTED", 1);

  const uploading = media.filter((row) => row.state !== "WAITING_PARENT" && row.state !== "FAILED");
  // EC-SYN-06
  if (input.snapshot?.slowLink === true && uploading.length > 0) add("SLOW_CONNECTION", uploading.length);

  // EC-SYN-11
  if (input.snapshot?.firstSyncDone === false && (input.firstSyncRows ?? 0) >= FIRST_SYNC_LARGE_ROWS) add("FIRST_SYNC_LARGE", input.firstSyncRows ?? 0);

  // EC-SYN-17/18/20–24 and RATE_LIMITED stored by the media queue.
  const byCode = new Map<AppErrorCode, number>();
  for (const row of media) {
    const code = progressOf(row).error as AppErrorCode | undefined;
    if (code !== undefined && MEDIA_ATTENTION_CODES.has(code)) byCode.set(code, (byCode.get(code) ?? 0) + 1);
  }
  for (const [code, count] of byCode) add(code, count);

  // EC-SYN-19: a transfer stopped part-way and is waiting to retry.
  add("UPLOAD_INTERRUPTED", uploading.filter((row) => row.attempts > 0 && Number(row.bytesSent) > 0 && progressOf(row).error !== undefined && !MEDIA_ATTENTION_CODES.has(progressOf(row).error as AppErrorCode)).length);

  // EC-SYN-25
  if (input.wifi !== true) {
    add("WIFI_ONLY_MEDIA_WAITING", media.filter((row) => row.wifiOnly === 1 && row.state === "QUEUED" && olderThan(row.capturedAt, staleCutoff)).length);
  }

  // EC-SYN-26: the original is fine but no preview exists.
  add("THUMBNAIL_FAILED", uploading.filter((row) => (row.kind === "PHOTO" || row.kind === "VIDEO") && row.thumbUri === null).length);

  // EC-SYN-27: released for upload (parent applied) yet still not uploaded after 24 h.
  add("MEDIA_PENDING_STALE", uploading.filter((row) => olderThan(row.capturedAt, staleCutoff)).length);

  // EC-SYN-28
  add("LOCATION_BUFFER_TRIMMED", input.locationTrimmed ?? input.snapshot?.locationTrimmed ?? 0);

  // EC-SYN-29: something is waiting and nothing has been sent for a day.
  const waiting = outbox.length + media.length;
  const lastSync = input.snapshot?.lastSyncAt;
  const oldestPending = outbox[0]?.createdAt;
  if (waiting > 0 && (olderThan(lastSync, staleCutoff) || (lastSync === undefined && olderThan(oldestPending, staleCutoff)))) add("DEVICE_UNSYNCED_STALE", waiting);

  // EC-SYN-30
  if (input.coldStart === true) {
    add("UPLOAD_RESUME_AFTER_RESTART", uploading.filter((row) => row.uploadId !== null || (progressOf(row).parts?.length ?? 0) > 0 || row.state === "UPLOADING").length);
  }

  // EC-SYN-31
  add("SAME_USER_MULTIPLE_DEVICES", input.otherDevicesWithPending ?? 0);

  return items;
}
