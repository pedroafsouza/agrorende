import type { FileStore, UploadResponse } from "../../src/media/files";

/** In-memory `FileStore`: files are byte lengths, uploads are scripted. */
export class FakeFiles implements FileStore {
  readonly files = new Map<string, number>();
  readonly uploads: { url: string; uri: string }[] = [];
  free = 10 * 1024 * 1024 * 1024;
  respond: (url: string, uri: string) => UploadResponse = (url) => ({ status: 200, headers: { ETag: `"etag-${url.split("/").pop() ?? ""}"` }, body: "" });

  add(uri: string, size: number): string {
    this.files.set(uri, size);
    return uri;
  }
  async persist(sourceUri: string, fileName: string) {
    const size = this.files.get(sourceUri) ?? 0;
    this.files.delete(sourceUri);
    const uri = `file:///doc/media/${fileName}`;
    this.files.set(uri, size);
    return uri;
  }
  async exists(uri: string) {
    return this.files.has(uri);
  }
  async size(uri: string) {
    return this.files.get(uri) ?? 0;
  }
  async remove(uri: string) {
    this.files.delete(uri);
  }
  async slice(uri: string, offset: number, length: number) {
    const part = `${uri}#${offset}`;
    this.files.set(part, length);
    return part;
  }
  async upload(url: string, uri: string) {
    this.uploads.push({ url, uri });
    return this.respond(url, uri);
  }
  async freeBytes() {
    return this.free;
  }
}
