import { mediaRootFromEnv } from "./init.js";
import { localMediaStore } from "./local.js";

export type MediaVariant = "original" | "thumb" | "poster";

export interface BlobRange {
  readonly start: number;
  /** Inclusive end offset, as in an HTTP `Range` header. */
  readonly end: number;
}

export interface StoredObject {
  readonly sizeBytes: number;
  readonly modifiedAt: Date;
}

export interface WriteResult {
  readonly sizeBytes: number;
  readonly etag: string;
}

export interface PartInfo {
  readonly n: number;
  readonly etag: string;
  readonly sizeBytes: number;
}

export interface UploadSession {
  readonly uploadId: string;
  readonly mediaId: string;
  readonly variant: MediaVariant;
  readonly sizeBytes: number;
  readonly mimeType: string;
  readonly partSize: number;
  readonly partCount: number;
  readonly createdAt: string;
}

/**
 * The storage seam of ARCHITECTURE §7.7. Signed URLs are built by `modules/media/upload.ts`
 * because the local driver serves them through the Node blob routes; the Phase 2 `s3`
 * driver will presign instead.
 */
export interface MediaStore {
  readonly driver: "local" | "s3";
  readonly root: string;
  createUpload(session: Omit<UploadSession, "uploadId" | "createdAt">): Promise<UploadSession>;
  getUpload(uploadId: string): Promise<UploadSession>;
  writePart(uploadId: string, partNumber: number, body: ReadableStream<Uint8Array> | Uint8Array | null, maxBytes: number): Promise<PartInfo>;
  listParts(uploadId: string): Promise<PartInfo[]>;
  /** Concatenates parts in order into a `.tmp` file and returns its path. */
  assembleUpload(uploadId: string, partNumbers: readonly number[]): Promise<string>;
  abortUpload(uploadId: string): Promise<void>;
  /** Single uploads land in `.uploads/single/<stagingKey>` until `complete` validates them. */
  stage(stagingKey: string, body: ReadableStream<Uint8Array> | Uint8Array | null, maxBytes: number): Promise<WriteResult>;
  stagedPath(stagingKey: string): Promise<string | null>;
  /** Atomically moves a staged or assembled file to its final key. */
  promote(file: string, key: string): Promise<void>;
  discard(file: string): Promise<void>;
  readHead(file: string, bytes: number): Promise<Uint8Array>;
  fileSize(file: string): Promise<number>;
  put(key: string, body: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  head(key: string): Promise<StoredObject | null>;
  read(key: string, range?: BlobRange): Promise<ReadableStream<Uint8Array>>;
  delete(key: string): Promise<void>;
  /** Throws `STORAGE_FULL` when free space is under 5 GB or 10 %. */
  assertSpace(incomingBytes?: number): Promise<void>;
}

let override: MediaStore | null = null;
let cached: { readonly root: string; readonly store: MediaStore } | null = null;

/** Tests inject a store rooted at `MEDIA_ROOT=.data/media-<task>`; `null` restores the default. */
export function setMediaStore(store: MediaStore | null): void {
  override = store;
}

/** Selects the driver from `MEDIA_DRIVER` (`local` by default; `s3` is reserved for Phase 2). */
export function mediaStore(env: NodeJS.ProcessEnv = process.env): MediaStore {
  if (override !== null) return override;
  const driver = env.MEDIA_DRIVER ?? "local";
  if (driver !== "local") throw new Error(`Unsupported MEDIA_DRIVER "${driver}": only "local" ships in the MVP (s3 is Phase 2).`);
  const root = mediaRootFromEnv(env);
  if (cached === null || cached.root !== root) cached = { root, store: localMediaStore({ root }) };
  return cached.store;
}

export { localMediaStore } from "./local.js";
