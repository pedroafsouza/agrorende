import { Directory, File, Paths } from "expo-file-system";
import { createUploadTask, FileSystemSessionType, FileSystemUploadType } from "expo-file-system/legacy";

import type { FileStore } from "./files";

const MEDIA_DIR = "media";
const PARTS_DIR = "media-parts";

function mediaDirectory(): Directory {
  const dir = new Directory(Paths.document, MEDIA_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function partsDirectory(): Directory {
  const dir = new Directory(Paths.cache, PARTS_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Production `FileStore`: modern expo-file-system for files, legacy upload tasks for background PUTs. */
export const expoFileStore: FileStore = {
  async persist(sourceUri, fileName) {
    const target = new File(mediaDirectory(), fileName);
    if (target.exists) target.delete();
    await new File(sourceUri).move(target);
    return target.uri;
  },
  async exists(uri) {
    return new File(uri).exists;
  },
  async size(uri) {
    return new File(uri).size;
  },
  async remove(uri) {
    const file = new File(uri);
    if (file.exists) file.delete();
  },
  async slice(uri, offset, length) {
    const handle = new File(uri).open();
    try {
      handle.offset = offset;
      const bytes = await handle.readBytes(length);
      const part = new File(partsDirectory(), `${Date.now()}-${offset}.part`);
      await part.write(bytes);
      return part.uri;
    } finally {
      handle.close();
    }
  },
  async upload(url, uri, options) {
    const task = createUploadTask(url, uri, {
      httpMethod: "PUT",
      uploadType: FileSystemUploadType.BINARY_CONTENT,
      sessionType: FileSystemSessionType.BACKGROUND,
      headers: { "Content-Type": options.mimeType, ...(options.headers ?? {}) },
    });
    const result = await task.uploadAsync();
    if (result === null || result === undefined) return { status: 0, headers: {}, body: "" };
    return { status: result.status, headers: result.headers, body: result.body };
  },
  async freeBytes() {
    return Paths.availableDiskSpace;
  },
  async writeTemp(fileName, base64) {
    const file = new File(Paths.cache, fileName);
    if (file.exists) file.delete();
    await file.write(base64, { encoding: "base64" });
    return file.uri;
  },
};
