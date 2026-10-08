/** File-system seam for the media queue; production uses expo-file-system, tests use a fake. */
export interface UploadResponse {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: string;
}

export interface FileStore {
  /** Moves a temporary capture into durable storage (`media/<mediaId>.<ext>`); returns its URI. */
  persist(sourceUri: string, fileName: string): Promise<string>;
  exists(uri: string): Promise<boolean>;
  size(uri: string): Promise<number>;
  remove(uri: string): Promise<void>;
  /** Writes bytes [offset, offset + length) of `uri` into a temporary part file. */
  slice(uri: string, offset: number, length: number): Promise<string>;
  /** Binary PUT of a whole file (background session where supported). */
  upload(url: string, uri: string, options: { readonly headers?: Record<string, string>; readonly mimeType: string }): Promise<UploadResponse>;
  freeBytes(): Promise<number>;
  /** Writes base64 content (signature PNG) to a temporary file and returns its URI. */
  writeTemp?(fileName: string, base64: string): Promise<string>;
}

export function extensionFor(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/heic": "heic",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "audio/mp4": "m4a",
    "audio/m4a": "m4a",
    "audio/aac": "aac",
    "application/pdf": "pdf",
  };
  return map[mimeType] ?? "bin";
}
