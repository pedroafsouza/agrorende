import { notImplemented } from "../errors.js";

export type MediaVariant = "original" | "thumb" | "poster";

export interface MediaStore {
  createUpload(mediaId: string, variant: MediaVariant): Promise<unknown>;
  partUrls(mediaId: string, variant: MediaVariant, uploadId: string, parts: readonly number[]): Promise<unknown>;
  complete(mediaId: string, variant: MediaVariant, uploadId?: string): Promise<void>;
  readUrl(mediaId: string, variant: MediaVariant): Promise<string>;
  put(key: string, body: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  head(key: string): Promise<{ sizeBytes: number; mimeType?: string }>;
  delete(key: string): Promise<void>;
}

export function mediaStore(): MediaStore {
  return notImplemented("storage.mediaStore");
}
