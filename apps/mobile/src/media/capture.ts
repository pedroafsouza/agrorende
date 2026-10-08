import type { MediaKind } from "@agrorende/contracts/enums";
import type { MediaMeta } from "@agrorende/contracts/sync";

import type { SqlDb } from "../db/sql";
import { LocalError } from "../lib/errors";
import { extensionFor, type FileStore } from "./files";
import { canCapture } from "./storage";

/** SIGNATURE > PHOTO > AUDIO > VIDEO (§7.7 step 4). */
export const MEDIA_PRIORITY: Readonly<Record<string, number>> = { SIGNATURE: 4, PHOTO: 3, DOCUMENT: 2, AUDIO: 1, VIDEO: 0 };

export interface CaptureInput {
  readonly meta: MediaMeta;
  readonly sourceUri: string;
  readonly thumbSourceUri?: string;
  /** Videos wait for Wi-Fi when the user setting is on. */
  readonly wifiOnly?: boolean;
}

export interface CapturedMedia {
  readonly meta: MediaMeta;
  readonly localUri: string;
  readonly thumbUri?: string;
}

/**
 * Durable capture (§7.7 step 1): move the file into the document directory and insert the
 * `media_files` row as WAITING_PARENT. The row is released for upload once the command
 * that registers the metadata is APPLIED.
 */
export async function persistCapture(db: SqlDb, files: FileStore, input: CaptureInput): Promise<CapturedMedia> {
  const free = await files.freeBytes();
  if (!canCapture(input.meta.kind as MediaKind, free)) throw new LocalError("STORAGE_FULL", { details: { freeBytes: free } });
  const localUri = await files.persist(input.sourceUri, `${input.meta.id}.${extensionFor(input.meta.mimeType)}`);
  const thumbUri = input.thumbSourceUri === undefined ? undefined : await files.persist(input.thumbSourceUri, `${input.meta.id}_thumb.jpg`);
  const sizeBytes = input.meta.sizeBytes ?? (await files.size(localUri));
  await db.run(
    "INSERT OR REPLACE INTO media_files (mediaId, localUri, thumbUri, mimeType, sizeBytes, kind, priority, state, partsDone, bytesSent, attempts, wifiOnly) VALUES (?, ?, ?, ?, ?, ?, ?, 'WAITING_PARENT', NULL, 0, 0, ?)",
    [input.meta.id, localUri, thumbUri ?? null, input.meta.mimeType, sizeBytes, input.meta.kind, MEDIA_PRIORITY[input.meta.kind] ?? 0, input.meta.kind === "VIDEO" && input.wifiOnly === true ? 1 : 0],
  );
  return { meta: { ...input.meta, sizeBytes }, localUri, ...(thumbUri === undefined ? {} : { thumbUri }) };
}

/** Removes a capture the user discarded before its parent command was written. */
export async function discardCapture(db: SqlDb, files: FileStore, mediaId: string): Promise<void> {
  const row = await db.get<{ localUri: string; thumbUri: string | null; state: string }>("SELECT localUri, thumbUri, state FROM media_files WHERE mediaId = ?", [mediaId]);
  if (row === undefined || row.state !== "WAITING_PARENT") return;
  const pending = await db.get("SELECT 1 AS x FROM outbox WHERE status IN ('PENDING', 'IN_FLIGHT') AND instr(payload, ?) > 0", [mediaId]);
  if (pending !== undefined) return;
  await files.remove(row.localUri);
  if (row.thumbUri !== null) await files.remove(row.thumbUri);
  await db.run("DELETE FROM media_files WHERE mediaId = ?", [mediaId]);
}

/** Local file for display: offline-first reads (§7.7 step 9). */
export async function localMediaUri(db: SqlDb, mediaId: string, variant: "thumb" | "original" = "original"): Promise<string | undefined> {
  const row = await db.get<{ localUri: string; thumbUri: string | null }>("SELECT localUri, thumbUri FROM media_files WHERE mediaId = ?", [mediaId]);
  if (row === undefined) return undefined;
  return variant === "thumb" ? (row.thumbUri ?? row.localUri) : row.localUri;
}
