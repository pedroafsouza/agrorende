import type { SqlDb } from "../db/sql";
import { TransportError, type MediaVariant, type SyncApi } from "../sync/transport";
import type { FileStore, UploadResponse } from "./files";

export const MEDIA_CONCURRENCY = 2;
export const MEDIA_BACKOFF_BASE_MS = 5_000;
export const MEDIA_BACKOFF_MAX_MS = 30 * 60 * 1000;
export const MEDIA_KEEP_AFTER_DONE_MS = 7 * 24 * 60 * 60 * 1000;
export const MEDIA_PRUNE_FREE_BYTES = 1024 * 1024 * 1024;

/** Codes that mark the row FAILED (§7.7 step 7); every other failure retries forever. */
const TERMINAL_CODES = new Set(["MEDIA_LOCKED", "NOT_FOUND", "MEDIA_TOO_LARGE"]);
/** The file is kept but the user is asked to retake or choose again. */
const USER_ACTION_CODES = new Set(["MEDIA_TYPE_MISMATCH", "LOCAL_MEDIA_MISSING", "LOCAL_MEDIA_CORRUPT"]);

export interface MediaProgress {
  thumb?: boolean;
  parts?: { n: number; etag: string }[];
  error?: string;
}

export interface MediaFileRow {
  readonly mediaId: string;
  readonly localUri: string;
  readonly thumbUri: string | null;
  readonly mimeType: string;
  readonly sizeBytes: number | null;
  readonly kind: string;
  readonly priority: number;
  readonly state: string;
  readonly uploadId: string | null;
  readonly partSize: number | null;
  readonly progress: MediaProgress;
  readonly bytesSent: number;
  readonly attempts: number;
  readonly nextAttemptAt: string | null;
  readonly wifiOnly: boolean;
}

export interface MediaQueueDeps {
  readonly db: SqlDb;
  readonly api: Pick<SyncApi, "uploadUrl" | "multipartParts" | "completeUpload">;
  readonly files: FileStore;
  readonly now: () => number;
  readonly random?: () => number;
  readonly isWifi: () => Promise<boolean>;
  readonly onChange?: () => void;
  /** EC-SYN-06: when true only signatures and thumbnails are sent; originals wait for a better link. */
  readonly slowLink?: () => boolean;
  /** Measured original-upload throughput, so the caller can update `slowLink` (§7.10). */
  readonly onThroughput?: (bytesPerSecond: number) => void;
}

export function mediaBackoffMs(attempts: number, random: () => number = Math.random): number {
  const exp = Math.min(MEDIA_BACKOFF_MAX_MS, MEDIA_BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1));
  return Math.round(exp * (0.8 + random() * 0.4));
}

function decode(row: Record<string, unknown>): MediaFileRow {
  let progress: MediaProgress = {};
  if (typeof row.partsDone === "string" && row.partsDone.length > 0) progress = JSON.parse(row.partsDone) as MediaProgress;
  return {
    mediaId: String(row.mediaId),
    localUri: String(row.localUri),
    thumbUri: (row.thumbUri as string | null) ?? null,
    mimeType: String(row.mimeType),
    sizeBytes: row.sizeBytes === null || row.sizeBytes === undefined ? null : Number(row.sizeBytes),
    kind: String(row.kind),
    priority: Number(row.priority),
    state: String(row.state),
    uploadId: (row.uploadId as string | null) ?? null,
    partSize: row.partSize === null || row.partSize === undefined ? null : Number(row.partSize),
    progress,
    bytesSent: Number(row.bytesSent ?? 0),
    attempts: Number(row.attempts ?? 0),
    nextAttemptAt: (row.nextAttemptAt as string | null) ?? null,
    wifiOnly: Number(row.wifiOnly) === 1,
  };
}

export async function listMediaFiles(db: SqlDb, states?: readonly string[]): Promise<MediaFileRow[]> {
  const where = states === undefined ? "" : `WHERE state IN (${states.map(() => "?").join(", ")})`;
  const rows = await db.all(`SELECT * FROM media_files ${where} ORDER BY priority DESC, rowid ASC`, states ?? []);
  return rows.map(decode);
}

/** Ready rows in upload order: priority, then oldest first. */
export async function nextUploads(db: SqlDb, nowIso: string, wifi: boolean, limit: number): Promise<MediaFileRow[]> {
  const rows = await db.all(
    `SELECT * FROM media_files WHERE state IN ('QUEUED', 'UPLOADING', 'UPLOADED') AND (nextAttemptAt IS NULL OR nextAttemptAt <= ?) ${wifi ? "" : "AND wifiOnly = 0"} ORDER BY priority DESC, rowid ASC LIMIT ?`,
    [nowIso, limit],
  );
  return rows.map(decode);
}

function etagOf(response: UploadResponse): string {
  const entry = Object.entries(response.headers).find(([key]) => key.toLowerCase() === "etag");
  return (entry?.[1] ?? "").replace(/"/g, "");
}

function codeFromBody(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: { code?: string }; code?: string };
    return parsed.error?.code ?? parsed.code;
  } catch (_error) {
    return undefined;
  }
}

/** EC-SYN-20: an S3 presigned URL past its expiry answers `403 Request has expired`. */
function expiredPresign(response: UploadResponse): boolean {
  return response.status === 403 && typeof response.body === "string" && /request has expired|AccessDenied.*expired/i.test(response.body);
}

function uploadError(response: UploadResponse): TransportError {
  const fallback: Record<number, string> = { 409: "MEDIA_PART_MISSING", 410: "UPLOAD_URL_EXPIRED", 413: "MEDIA_TOO_LARGE", 507: "STORAGE_FULL" };
  const code = expiredPresign(response) ? "UPLOAD_URL_EXPIRED" : (codeFromBody(response.body) ?? fallback[response.status]);
  return new TransportError("http", { status: response.status, ...(code === undefined ? {} : { code }) });
}

const STORED = Symbol("stored");

/**
 * `MEDIA_LOCKED` from upload-url, the blob PUT or complete means this variant is already
 * stored on the server: an earlier attempt succeeded but its answer was lost (A7 for media).
 * The queue treats it as success instead of failing a file the office already has.
 */
async function alreadyStored<T>(call: Promise<T>): Promise<T | typeof STORED> {
  try {
    return await call;
  } catch (error) {
    if (error instanceof TransportError && error.code === "MEDIA_LOCKED") return STORED;
    throw error;
  }
}

function lockedResponse(response: UploadResponse): boolean {
  return response.status === 409 && codeFromBody(response.body) === "MEDIA_LOCKED";
}

export type MediaUploadOutcome = "done" | "retry" | "failed" | "needsUser" | "deferred";

/** Uploads one row: thumbnail first, then the original (single or multipart), then complete. */
export async function uploadOne(deps: MediaQueueDeps, row: MediaFileRow): Promise<MediaUploadOutcome> {
  const { db, api, files } = deps;
  const progress: MediaProgress = { ...row.progress };
  const save = async (patch: string, params: readonly (string | number | null)[]) => {
    await db.run(`UPDATE media_files SET ${patch} WHERE mediaId = ?`, [...params, row.mediaId]);
  };
  try {
    // EC-SYN-17 / EC-SYN-18: never upload a missing, empty or changed original.
    if (!(await files.exists(row.localUri))) throw new TransportError("http", { status: 404, code: "LOCAL_MEDIA_MISSING", message: "local file missing" });
    const actualSize = await files.size(row.localUri);
    if (actualSize === 0 || (row.sizeBytes !== null && row.sizeBytes > 0 && actualSize !== row.sizeBytes)) {
      throw new TransportError("http", { status: 422, code: "LOCAL_MEDIA_CORRUPT", message: "local file changed" });
    }
    await save("state = 'UPLOADING'", []);
    deps.onChange?.();
    if (row.thumbUri !== null && progress.thumb !== true && (await files.exists(row.thumbUri))) {
      const variant: MediaVariant = row.kind === "VIDEO" ? "poster" : "thumb";
      const size = await files.size(row.thumbUri);
      const target = await alreadyStored(api.uploadUrl(row.mediaId, { sizeBytes: size, mimeType: "image/jpeg", variant }));
      if (target !== STORED && target.mode === "single") {
        const response = await files.upload(target.url, row.thumbUri, { mimeType: "image/jpeg", ...(target.headers === undefined ? {} : { headers: target.headers }) });
        if (response.status >= 300 && !lockedResponse(response)) throw uploadError(response);
        if (!lockedResponse(response)) await alreadyStored(api.completeUpload(row.mediaId, { variant }));
      }
      progress.thumb = true;
      await save("partsDone = ?", [JSON.stringify(progress)]);
    }

    // EC-SYN-06: on a very slow link the preview goes first and the video original waits.
    if (deps.slowLink?.() === true && row.kind === "VIDEO") {
      await save("state = 'QUEUED'", []);
      deps.onChange?.();
      return "deferred";
    }

    const sizeBytes = row.sizeBytes ?? (await files.size(row.localUri));
    const startedAt = deps.now();
    let uploadId = row.uploadId;
    let partSize = row.partSize;
    let parts: readonly { n: number; url: string }[] = [];
    if (uploadId === null) {
      const target = await alreadyStored(api.uploadUrl(row.mediaId, { sizeBytes, mimeType: row.mimeType, variant: "original" }));
      // The original landed on an earlier attempt whose answer was lost.
      if (target === STORED) return await markDone(deps, row.mediaId);
      if (target.mode === "single") {
        const response = await files.upload(target.url, row.localUri, { mimeType: row.mimeType, ...(target.headers === undefined ? {} : { headers: target.headers }) });
        if (lockedResponse(response)) return await markDone(deps, row.mediaId);
        if (response.status >= 300) throw uploadError(response);
        reportThroughput(deps, sizeBytes, startedAt);
        await save("bytesSent = ?, state = 'UPLOADED'", [sizeBytes]);
        await alreadyStored(api.completeUpload(row.mediaId, { variant: "original" }));
        return await markDone(deps, row.mediaId);
      }
      uploadId = target.uploadId;
      partSize = target.partSize;
      parts = target.parts;
      progress.parts = [];
      await save("uploadId = ?, partSize = ?, partsDone = ?", [uploadId, partSize, JSON.stringify(progress)]);
    }
    const size = partSize ?? 8 * 1024 * 1024;
    const total = Math.max(1, Math.ceil(sizeBytes / size));
    const done = new Map((progress.parts ?? []).map((p) => [p.n, p.etag]));
    const missing = Array.from({ length: total }, (_, i) => i + 1).filter((n) => !done.has(n));
    if (missing.length > 0 && missing.some((n) => !parts.some((p) => p.n === n))) {
      parts = (await api.multipartParts(row.mediaId, { uploadId, partNumbers: missing })).parts;
    }
    for (const n of missing) {
      const url = parts.find((p) => p.n === n)?.url;
      if (url === undefined) throw new TransportError("http", { status: 410, code: "UPLOAD_URL_EXPIRED" });
      const offset = (n - 1) * size;
      const partUri = await files.slice(row.localUri, offset, Math.min(size, sizeBytes - offset));
      try {
        const response = await files.upload(url, partUri, { mimeType: "application/octet-stream" });
        if (response.status >= 300) throw uploadError(response);
        done.set(n, etagOf(response));
      } finally {
        await files.remove(partUri);
      }
      progress.parts = [...done.entries()].map(([pn, etag]) => ({ n: pn, etag })).sort((a, b) => a.n - b.n);
      await save("partsDone = ?, bytesSent = ?", [JSON.stringify(progress), Math.min(sizeBytes, done.size * size)]);
      deps.onChange?.();
    }
    reportThroughput(deps, missing.length * size, startedAt);
    try {
      await alreadyStored(api.completeUpload(row.mediaId, { variant: "original", uploadId, parts: progress.parts ?? [] }));
    } catch (error) {
      if (error instanceof TransportError && error.code === "MEDIA_PART_MISSING") {
        const missingParts = (error.body as { error?: { details?: { missing?: number[] } } } | undefined)?.error?.details?.missing;
        progress.parts = (progress.parts ?? []).filter((p) => missingParts === undefined || !missingParts.includes(p.n));
        if (missingParts === undefined) progress.parts = [];
        await save("partsDone = ?", [JSON.stringify(progress)]);
      }
      throw error;
    }
    return await markDone(deps, row.mediaId);
  } catch (error) {
    return failUpload(deps, row, progress, error);
  }
}

function reportThroughput(deps: MediaQueueDeps, bytes: number, startedAt: number): void {
  const elapsedMs = deps.now() - startedAt;
  if (deps.onThroughput === undefined || elapsedMs <= 0 || bytes <= 0) return;
  deps.onThroughput((bytes * 1000) / elapsedMs);
}

async function markDone(deps: MediaQueueDeps, mediaId: string): Promise<MediaUploadOutcome> {
  const now = deps.now();
  await deps.db.run("UPDATE media_files SET state = 'DONE', doneAt = ?, deleteAfter = ?, nextAttemptAt = NULL WHERE mediaId = ?", [
    new Date(now).toISOString(),
    new Date(now + MEDIA_KEEP_AFTER_DONE_MS).toISOString(),
    mediaId,
  ]);
  await deps.db.run("UPDATE media SET status = 'UPLOADED' WHERE id = ?", [mediaId]);
  deps.onChange?.();
  return "done";
}

async function failUpload(deps: MediaQueueDeps, row: MediaFileRow, progress: MediaProgress, error: unknown): Promise<MediaUploadOutcome> {
  const code = error instanceof TransportError ? error.code : undefined;
  if (code !== undefined && (TERMINAL_CODES.has(code) || USER_ACTION_CODES.has(code))) {
    progress.error = code;
    await deps.db.run("UPDATE media_files SET state = 'FAILED', partsDone = ? WHERE mediaId = ?", [JSON.stringify(progress), row.mediaId]);
    deps.onChange?.();
    return USER_ACTION_CODES.has(code) ? "needsUser" : "failed";
  }
  const attempts = row.attempts + 1;
  const retryAfter = error instanceof TransportError && error.retryAfterMs !== undefined ? error.retryAfterMs : mediaBackoffMs(attempts, deps.random);
  progress.error = code ?? (error instanceof TransportError ? error.kind : "INTERNAL");
  await deps.db.run(
    `UPDATE media_files SET state = 'QUEUED', attempts = ?, nextAttemptAt = ?, partsDone = ? WHERE mediaId = ?`,
    [attempts, new Date(deps.now() + retryAfter).toISOString(), JSON.stringify(progress), row.mediaId],
  );
  deps.onChange?.();
  return "retry";
}

/** Drains the queue with at most two concurrent uploads (§7.7 step 4). */
export async function drainMediaQueue(deps: MediaQueueDeps, maxRounds = 50): Promise<{ readonly done: number; readonly retried: number; readonly failed: number }> {
  let done = 0;
  let retried = 0;
  let failed = 0;
  const wifi = await deps.isWifi();
  const attempted = new Set<string>();
  for (let round = 0; round < maxRounds; round += 1) {
    const batch = (await nextUploads(deps.db, new Date(deps.now()).toISOString(), wifi, MEDIA_CONCURRENCY + attempted.size)).filter((row) => !attempted.has(row.mediaId)).slice(0, MEDIA_CONCURRENCY);
    if (batch.length === 0) break;
    const outcomes = await Promise.all(
      batch.map((row) => {
        attempted.add(row.mediaId);
        return uploadOne(deps, row);
      }),
    );
    for (const outcome of outcomes) {
      if (outcome === "done") done += 1;
      else if (outcome === "retry") retried += 1;
      else if (outcome !== "deferred") failed += 1;
    }
  }
  return { done, retried, failed };
}

/** Clean-up (§7.7 step 8): DONE files after `deleteAfter`, or right away when space is low. */
export async function pruneMediaFiles(db: SqlDb, files: FileStore, nowMs: number, freeBytes: number): Promise<number> {
  const urgent = freeBytes < MEDIA_PRUNE_FREE_BYTES;
  const rows = await db.all<{ mediaId: string; localUri: string; thumbUri: string | null }>(
    `SELECT mediaId, localUri, thumbUri FROM media_files WHERE state = 'DONE' ${urgent ? "" : "AND deleteAfter <= ?"}`,
    urgent ? [] : [new Date(nowMs).toISOString()],
  );
  for (const row of rows) {
    await files.remove(row.localUri);
    if (row.thumbUri !== null) await files.remove(row.thumbUri);
    await db.run("DELETE FROM media_files WHERE mediaId = ?", [row.mediaId]);
  }
  return rows.length;
}

/** Sync Center: retry a FAILED row now, or discard it (the server row stays). */
export async function retryMediaFile(db: SqlDb, mediaId: string): Promise<void> {
  await db.run("UPDATE media_files SET state = 'QUEUED', attempts = 0, nextAttemptAt = NULL WHERE mediaId = ? AND state IN ('FAILED', 'QUEUED')", [mediaId]);
}

/** EC-SYN-25: one-time "Use mobile data for this video" override; the setting itself is unchanged. */
export async function allowMobileDataOnce(db: SqlDb, mediaId: string): Promise<void> {
  await db.run("UPDATE media_files SET wifiOnly = 0, nextAttemptAt = NULL WHERE mediaId = ? AND wifiOnly = 1", [mediaId]);
}

export async function discardMediaFile(db: SqlDb, files: FileStore, mediaId: string): Promise<void> {
  const row = await db.get<{ localUri: string; thumbUri: string | null }>("SELECT localUri, thumbUri FROM media_files WHERE mediaId = ? AND state = 'FAILED'", [mediaId]);
  if (row === undefined) return;
  await files.remove(row.localUri);
  if (row.thumbUri !== null) await files.remove(row.thumbUri);
  await db.run("DELETE FROM media_files WHERE mediaId = ?", [mediaId]);
}
