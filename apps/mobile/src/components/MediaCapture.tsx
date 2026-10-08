import type { MediaMeta } from "@agrorende/contracts/sync";

import { notImplemented } from "../lib/notImplemented";

export type MediaDraft = MediaMeta & { readonly localUri: string; readonly thumbUri?: string };
export type MediaCaptureProps = { readonly parent: MediaMeta["parent"]; readonly allowedTags: readonly string[]; readonly silhouette?: string; readonly onChange: (drafts: readonly MediaDraft[]) => void };
export function MediaCapture(_props: MediaCaptureProps): never { return notImplemented("components.MediaCapture"); }
