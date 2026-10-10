import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, lstat, mkdir, open, readdir, readFile, realpath, rename, rm, stat, statfs, writeFile } from "node:fs/promises";
import path from "node:path";

import { AppError } from "@agrorende/contracts/errors";

import type { BlobRange, MediaStore, PartInfo, StoredObject, UploadSession, WriteResult } from "./index";

export const FILE_MODE = 0o640;
export const DIR_MODE = 0o750;
export const MIN_FREE_BYTES = 5 * 1024 * 1024 * 1024;
export const MIN_FREE_RATIO = 0.1;

const UPLOAD_ID = /^[0-9a-f-]{36}$/u;
const KEY_SEGMENT = /^[A-Za-z0-9._-]+$/u;

export interface LocalStoreOptions {
  readonly root: string;
  /** Overrides the free-space probe; used by tests to force `STORAGE_FULL`. */
  readonly freeSpace?: () => Promise<{ readonly freeBytes: number; readonly totalBytes: number }>;
}

function invalidKey(key: string): never {
  throw new AppError("VALIDATION_FAILED", { fieldErrors: [{ path: "key", code: "invalid_key" }], details: { key: key.slice(0, 200) } });
}

/** Rejects absolute keys, `..`, empty or unusual segments before any path is built. */
export function assertSafeKey(key: string): string {
  if (key.length === 0 || key.length > 512 || key.includes("\0") || key.startsWith("/") || key.includes("\\")) invalidKey(key);
  const segments = key.split("/");
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === ".." || !KEY_SEGMENT.test(segment)) invalidKey(key);
  }
  if (segments[0]?.startsWith(".") === true) invalidKey(key);
  return key;
}

async function fsyncFile(file: string): Promise<void> {
  const handle = await open(file, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

/**
 * The MVP media driver (`MEDIA_DRIVER=local`, ARCHITECTURE §7.7): files under `MEDIA_ROOT`,
 * staged in `.tmp`/`.uploads`, fsynced and renamed atomically, `0640` files in `0750` folders.
 */
export function localMediaStore(options: LocalStoreOptions): MediaStore {
  const root = path.resolve(options.root);
  const tmpDir = path.join(root, ".tmp");
  const uploadsDir = path.join(root, ".uploads");

  const freeSpace =
    options.freeSpace ??
    (async () => {
      await mkdir(root, { recursive: true, mode: DIR_MODE });
      const info = await statfs(root);
      return { freeBytes: info.bavail * info.bsize, totalBytes: info.blocks * info.bsize };
    });

  async function ensureDir(dir: string): Promise<void> {
    await mkdir(dir, { recursive: true, mode: DIR_MODE });
  }

  async function assertSpace(incomingBytes = 0): Promise<void> {
    const { freeBytes, totalBytes } = await freeSpace();
    const remaining = freeBytes - incomingBytes;
    if (remaining < MIN_FREE_BYTES || (totalBytes > 0 && remaining / totalBytes < MIN_FREE_RATIO)) {
      throw new AppError("STORAGE_FULL", { details: { retryAfterMs: 15 * 60 * 1000 } });
    }
  }

  /** Resolves a key inside `MEDIA_ROOT`, refusing symlinks on the existing part of the path. */
  async function resolveKey(key: string): Promise<string> {
    assertSafeKey(key);
    const target = path.resolve(root, ...key.split("/"));
    if (!target.startsWith(`${root}${path.sep}`)) invalidKey(key);
    const realRoot = await realpath(root).catch(() => root);
    let current = root;
    for (const segment of key.split("/")) {
      current = path.join(current, segment);
      try {
        const info = await lstat(current);
        if (info.isSymbolicLink()) invalidKey(key);
      } catch (error) {
        if (isNotFound(error)) break;
        throw error;
      }
    }
    const parent = await realpath(path.dirname(target)).catch(() => null);
    if (parent !== null && parent !== realRoot && !parent.startsWith(`${realRoot}${path.sep}`)) invalidKey(key);
    return target;
  }

  function uploadDir(uploadId: string): string {
    if (!UPLOAD_ID.test(uploadId)) throw new AppError("NOT_FOUND", { details: { uploadId: "invalid" } });
    return path.join(uploadsDir, uploadId);
  }

  /** Streams `body` into a fresh `.tmp` file, counting bytes and stopping past `maxBytes`. */
  async function streamToTmp(body: ReadableStream<Uint8Array> | Uint8Array | null, maxBytes: number): Promise<{ file: string; sizeBytes: number; sha256: string }> {
    await ensureDir(tmpDir);
    await assertSpace();
    const file = path.join(tmpDir, `${randomUUID()}.tmp`);
    const handle = await open(file, "wx", FILE_MODE);
    const hash = createHash("sha256");
    let sizeBytes = 0;
    try {
      const write = async (chunk: Uint8Array): Promise<void> => {
        sizeBytes += chunk.byteLength;
        if (sizeBytes > maxBytes) throw new AppError("MEDIA_TOO_LARGE", { details: { maxBytes } });
        hash.update(chunk);
        try {
          await handle.write(chunk);
        } catch (error) {
          if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOSPC") throw new AppError("STORAGE_FULL");
          throw error;
        }
      };
      if (body instanceof Uint8Array) {
        await write(body);
      } else if (body !== null) {
        const reader = body.getReader();
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          await write(chunk.value);
        }
      }
      await handle.sync();
    } catch (error) {
      await handle.close().catch(() => undefined);
      await rm(file, { force: true });
      throw error;
    }
    await handle.close();
    return { file, sizeBytes, sha256: hash.digest("hex") };
  }

  async function moveInto(file: string, target: string): Promise<void> {
    await ensureDir(path.dirname(target));
    await chmod(file, FILE_MODE);
    await rename(file, target);
  }

  async function readSession(uploadId: string): Promise<UploadSession> {
    try {
      const raw = await readFile(path.join(uploadDir(uploadId), "session.json"), "utf8");
      return JSON.parse(raw) as UploadSession;
    } catch (error) {
      if (isNotFound(error)) throw new AppError("NOT_FOUND", { details: { uploadId } });
      throw error;
    }
  }

  const store: MediaStore = {
    driver: "local",
    root,

    async createUpload(session) {
      const uploadId = randomUUID();
      const dir = uploadDir(uploadId);
      await ensureDir(dir);
      const full: UploadSession = { ...session, uploadId, createdAt: new Date().toISOString() };
      await writeFile(path.join(dir, "session.json"), JSON.stringify(full), { mode: FILE_MODE });
      return full;
    },

    getUpload: readSession,

    async writePart(uploadId, partNumber, body, maxBytes): Promise<PartInfo> {
      const dir = uploadDir(uploadId);
      await readSession(uploadId);
      const written = await streamToTmp(body, maxBytes);
      const etag = written.sha256.slice(0, 32);
      await moveInto(written.file, path.join(dir, `${String(partNumber).padStart(5, "0")}.part`));
      await writeFile(path.join(dir, `${String(partNumber).padStart(5, "0")}.etag`), etag, { mode: FILE_MODE });
      return { n: partNumber, etag, sizeBytes: written.sizeBytes };
    },

    async listParts(uploadId): Promise<PartInfo[]> {
      const dir = uploadDir(uploadId);
      const names = await readdir(dir).catch((error: unknown) => {
        if (isNotFound(error)) throw new AppError("NOT_FOUND", { details: { uploadId } });
        throw error;
      });
      const parts: PartInfo[] = [];
      for (const name of names.filter((item) => item.endsWith(".part")).sort()) {
        const n = Number.parseInt(name, 10);
        const info = await stat(path.join(dir, name));
        const etag = await readFile(path.join(dir, name.replace(/\.part$/u, ".etag")), "utf8").catch(() => "");
        parts.push({ n, etag, sizeBytes: info.size });
      }
      return parts;
    },

    async assembleUpload(uploadId, partNumbers): Promise<string> {
      const dir = uploadDir(uploadId);
      await ensureDir(tmpDir);
      await assertSpace();
      const file = path.join(tmpDir, `${randomUUID()}.tmp`);
      const out = await open(file, "wx", FILE_MODE);
      try {
        for (const n of partNumbers) {
          const data = await readFile(path.join(dir, `${String(n).padStart(5, "0")}.part`));
          await out.write(data);
        }
        await out.sync();
      } catch (error) {
        await out.close().catch(() => undefined);
        await rm(file, { force: true });
        throw error;
      }
      await out.close();
      return file;
    },

    async abortUpload(uploadId) {
      await rm(uploadDir(uploadId), { recursive: true, force: true });
    },

    async stage(stagingKey, body, maxBytes): Promise<WriteResult> {
      assertSafeKey(stagingKey);
      const written = await streamToTmp(body, maxBytes);
      const target = path.join(uploadsDir, "single", ...stagingKey.split("/"));
      await moveInto(written.file, target);
      return { sizeBytes: written.sizeBytes, etag: written.sha256.slice(0, 32) };
    },

    async stagedPath(stagingKey): Promise<string | null> {
      assertSafeKey(stagingKey);
      const target = path.join(uploadsDir, "single", ...stagingKey.split("/"));
      try {
        await stat(target);
        return target;
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },

    async promote(file, key) {
      const target = await resolveKey(key);
      await fsyncFile(file);
      await moveInto(file, target);
    },

    async discard(file) {
      await rm(file, { force: true });
    },

    async readHead(file, bytes) {
      const handle = await open(file, "r");
      try {
        const buffer = new Uint8Array(bytes);
        const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
        return buffer.subarray(0, bytesRead);
      } finally {
        await handle.close();
      }
    },

    async fileSize(file) {
      return (await stat(file)).size;
    },

    async put(key, body) {
      const target = await resolveKey(key);
      const written = await streamToTmp(body, Number.MAX_SAFE_INTEGER);
      await moveInto(written.file, target);
    },

    async get(key) {
      return new Uint8Array(await readFile(await resolveKey(key)));
    },

    async head(key): Promise<StoredObject | null> {
      try {
        const info = await stat(await resolveKey(key));
        return { sizeBytes: info.size, modifiedAt: info.mtime };
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },

    async read(key, range?: BlobRange) {
      const target = await resolveKey(key);
      const opts = range === undefined ? {} : { start: range.start, end: range.end };
      const stream = createReadStream(target, opts);
      return new ReadableStream<Uint8Array>({
        start(controller) {
          stream.on("data", (chunk) => controller.enqueue(typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk)));
          stream.on("end", () => controller.close());
          stream.on("error", (error) => controller.error(error));
        },
        cancel() {
          stream.destroy();
        },
      });
    },

    async delete(key) {
      await rm(await resolveKey(key), { force: true });
    },

    assertSpace,
  };
  return store;
}
