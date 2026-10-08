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

export interface CaptureDeps {
  readonly db: SqlDb;
  readonly files: FileStore;
  readonly newId: () => string;
  readonly now: () => number;
  readonly wifiOnlyVideo?: boolean;
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

/** Durable capture → `MediaDraft` (file in the document directory + WAITING_PARENT row). */
export async function captureToDraft(deps: CaptureDeps, parent: MediaMeta["parent"], raw: RawCapture): Promise<MediaDraft> {
  const meta = buildMediaMeta(raw, parent, deps);
  const captured = await persistCapture(deps.db, deps.files, { meta, sourceUri: raw.sourceUri, ...(deps.wifiOnlyVideo === undefined ? {} : { wifiOnly: deps.wifiOnlyVideo }) });
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
