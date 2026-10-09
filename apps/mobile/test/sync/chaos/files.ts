import type { FileStore, UploadResponse } from "../../../src/media/files";

interface Entry {
  readonly bytes?: Uint8Array;
  readonly size: number;
}

/** JPEG with valid SOI/EOI markers so the server's magic-byte check passes. */
export function jpegBytes(size = 4096, seed = 1): Uint8Array {
  const bytes = new Uint8Array(Math.max(size, 8));
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 31 + seed * 7) % 251;
  bytes.set([0xff, 0xd8, 0xff, 0xe0], 0);
  bytes.set([0xff, 0xd9], bytes.length - 2);
  return bytes;
}

/** MP4 with an `ftyp` box at offset 4. */
export function mp4Bytes(size: number, seed = 3): Uint8Array {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i += 4096) bytes[i] = (i / 4096 + seed) % 251;
  bytes.set([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d], 0);
  return bytes;
}

/**
 * `FileStore` for the chaos suite: real bytes kept in memory, real HTTP PUT uploads through
 * `fetch` (so msw routes them to the in-process core blob handlers), and "virtual" files that
 * only have a size, used for the 5 GB metadata scenario (C9) without allocating memory.
 */
export class ChaosFiles implements FileStore {
  readonly files = new Map<string, Entry>();
  readonly uploads: { readonly url: string; readonly uri: string; readonly status: number }[] = [];
  free = 64 * 1024 * 1024 * 1024;
  wifi = true;
  /** Simulated link speed for uploads (EC-SYN-06); unlimited when undefined. */
  bandwidthBps: number | undefined;
  private temp = 0;

  constructor(private readonly deviceId: string) {}

  add(uri: string, bytes: Uint8Array): string {
    this.files.set(uri, { bytes, size: bytes.byteLength });
    return uri;
  }

  addVirtual(uri: string, size: number): string {
    this.files.set(uri, { size });
    return uri;
  }

  bytesOf(uri: string): Uint8Array | undefined {
    return this.files.get(uri)?.bytes;
  }

  /** Overwrites a stored file, used to simulate corruption on disk. */
  corrupt(uri: string, bytes: Uint8Array): void {
    this.files.set(uri, { bytes, size: bytes.byteLength });
  }

  partFiles(): string[] {
    return [...this.files.keys()].filter((uri) => uri.includes("#part-"));
  }

  async persist(sourceUri: string, fileName: string): Promise<string> {
    const entry = this.files.get(sourceUri);
    if (entry === undefined) throw new Error(`missing source ${sourceUri}`);
    this.files.delete(sourceUri);
    const uri = `file:///doc/media/${fileName}`;
    this.files.set(uri, entry);
    return uri;
  }

  async exists(uri: string): Promise<boolean> {
    return this.files.has(uri);
  }

  async size(uri: string): Promise<number> {
    return this.files.get(uri)?.size ?? 0;
  }

  async remove(uri: string): Promise<void> {
    this.files.delete(uri);
  }

  async slice(uri: string, offset: number, length: number): Promise<string> {
    const entry = this.files.get(uri);
    if (entry === undefined) throw new Error(`missing ${uri}`);
    this.temp += 1;
    const part = `${uri}#part-${this.temp}`;
    if (entry.bytes === undefined) this.files.set(part, { size: length });
    else this.files.set(part, { bytes: entry.bytes.subarray(offset, offset + length), size: length });
    return part;
  }

  async upload(url: string, uri: string, options: { readonly headers?: Record<string, string>; readonly mimeType: string }): Promise<UploadResponse> {
    const entry = this.files.get(uri);
    const bytes = entry?.bytes;
    if (bytes === undefined) throw new Error(`cannot upload virtual or missing file ${uri}`);
    const bandwidth = this.bandwidthBps;
    if (bandwidth !== undefined) await new Promise((resolve) => setTimeout(resolve, Math.ceil((bytes.byteLength * 1000) / bandwidth)));
    const response = await fetch(url, {
      method: "PUT",
      headers: { "content-type": options.mimeType, ...(options.headers ?? {}), "x-chaos-device": this.deviceId },
      body: new Blob([Uint8Array.from(bytes)]),
    });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    const body = await response.text();
    this.uploads.push({ url, uri, status: response.status });
    return { status: response.status, headers, body };
  }

  async freeBytes(): Promise<number> {
    return this.free;
  }

  async writeTemp(fileName: string, base64: string): Promise<string> {
    const uri = `file:///tmp-capture/${fileName}`;
    this.add(uri, Uint8Array.from(Buffer.from(base64, "base64")));
    return uri;
  }
}
