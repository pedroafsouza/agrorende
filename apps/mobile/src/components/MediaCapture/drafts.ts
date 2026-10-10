import type { MediaKind } from "@agrorende/contracts/enums";
import type { MediaMeta } from "@agrorende/contracts/sync";

import type { SqlDb } from "../../db/sql";
import { discardCapture, persistCapture } from "../../media/capture";
import type { FileStore } from "../../media/files";

export type MediaDraft = MediaMeta & { readonly localUri: string; readonly thumbUri?: string };

export interface RawCapture {
  readonly kind: MediaKind;
  readonly tag: string;
  readonly mimeType: string;
  readonly sourceUri: string;
  readonly width?: number;
  readonly height?: number;
  readonly durationMs?: number;
  readonly checklistItemKey?: string;
  readonly lat?: number;
  readonly lng?: number;
}

/** A resized copy of the capture plus its preview image (ARCHITECTURE §7.7 step 2). */
export interface PreparedCapture {
  readonly uri: string;
  readonly thumbUri: string;
  readonly width?: number;
  readonly height?: number;
}

export interface CaptureDeps {
  readonly db: SqlDb;
  readonly files: FileStore;
  readonly newId: () => string;
  readonly now: () => number;
  readonly wifiOnlyVideo?: boolean;
  /** Photos: 2048 px JPEG q0.8 plus the 320 px thumbnail that uploads before the original. */
  readonly preparePhoto?: (uri: string, width: number, height: number) => Promise<PreparedCapture>;
  /** Videos: the poster frame uploaded as the `poster` variant. */
  readonly prepareVideoPoster?: (uri: string) => Promise<string>;
}

export function buildMediaMeta(raw: RawCapture, parent: MediaMeta["parent"], deps: Pick<CaptureDeps, "newId" | "now">): MediaMeta {
  return {
    id: deps.newId(),
    kind: raw.kind,
    tag: raw.tag,
    mimeType: raw.mimeType,
    capturedAt: new Date(deps.now()).toISOString(),
    parent,
    ...(raw.width === undefined ? {} : { width: Math.round(raw.width) }),
    ...(raw.height === undefined ? {} : { height: Math.round(raw.height) }),
    ...(raw.durationMs === undefined ? {} : { durationMs: Math.round(raw.durationMs) }),
    ...(raw.checklistItemKey === undefined ? {} : { checklistItemKey: raw.checklistItemKey }),
    ...(raw.lat === undefined || raw.lng === undefined ? {} : { lat: raw.lat, lng: raw.lng }),
  };
}

/**
 * Resizes photos and renders the thumbnail or video poster before the file becomes durable.
 * A failed preview never blocks the capture: the original is kept, the Sync Center counts the
 * missing thumbnail and the office falls back to the original (EC-SYN-14 stays for real failures).
 */
export async function prepareCapture(deps: Pick<CaptureDeps, "preparePhoto" | "prepareVideoPoster">, raw: RawCapture): Promise<{ raw: RawCapture; thumbSourceUri?: string }> {
  try {
    if (raw.kind === "PHOTO" && deps.preparePhoto !== undefined) {
      const prepared = await deps.preparePhoto(raw.sourceUri, raw.width ?? 0, raw.height ?? 0);
      return {
        raw: { ...raw, sourceUri: prepared.uri, mimeType: "image/jpeg", ...(prepared.width === undefined ? {} : { width: prepared.width }), ...(prepared.height === undefined ? {} : { height: prepared.height }) },
        thumbSourceUri: prepared.thumbUri,
      };
    }
    if (raw.kind === "VIDEO" && deps.prepareVideoPoster !== undefined) {
      return { raw, thumbSourceUri: await deps.prepareVideoPoster(raw.sourceUri) };
    }
  } catch (_error) {
    return { raw };
  }
  return { raw };
}

/** Durable capture → `MediaDraft` (file in the document directory + WAITING_PARENT row). */
export async function captureToDraft(deps: CaptureDeps, parent: MediaMeta["parent"], input: RawCapture): Promise<MediaDraft> {
  const { raw, thumbSourceUri } = await prepareCapture(deps, input);
  const meta = buildMediaMeta(raw, parent, deps);
  const captured = await persistCapture(deps.db, deps.files, {
    meta,
    sourceUri: raw.sourceUri,
    ...(thumbSourceUri === undefined ? {} : { thumbSourceUri }),
    ...(deps.wifiOnlyVideo === undefined ? {} : { wifiOnly: deps.wifiOnlyVideo }),
  });
  return { ...captured.meta, localUri: captured.localUri, ...(captured.thumbUri === undefined ? {} : { thumbUri: captured.thumbUri }) };
}

export async function removeDraft(deps: Pick<CaptureDeps, "db" | "files">, drafts: readonly MediaDraft[], id: string): Promise<MediaDraft[]> {
  await discardCapture(deps.db, deps.files, id);
  return drafts.filter((d) => d.id !== id);
}

export function countByTag(drafts: readonly MediaDraft[]): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const d of drafts) counts[d.tag] = (counts[d.tag] ?? 0) + 1;
  return counts;
}
