import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { mediaStore } from "../../storage/index";

/** The subset of `MediaStore` that exports need. */
export interface ExportStore {
  put(key: string, body: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}

export function fsExportStore(root: string): ExportStore {
  const base = path.resolve(root);
  const resolve = (key: string): string => {
    const target = path.resolve(base, key);
    if (!target.startsWith(`${base}${path.sep}`)) throw new Error("Export storage key escapes MEDIA_ROOT");
    return target;
  };
  return {
    async put(key, body) {
      const target = resolve(key);
      await mkdir(path.dirname(target), { recursive: true });
      const tmp = `${target}.${process.pid}.tmp`;
      await writeFile(tmp, body);
      await rename(tmp, target);
    },
    async get(key) {
      return new Uint8Array(await readFile(resolve(key)));
    },
    async delete(key) {
      await rm(resolve(key), { force: true });
    },
  };
}

/**
 * Uses the T02 `MediaStore` when it is implemented and falls back to the local filesystem
 * under `MEDIA_ROOT` while `mediaStore()` is still a seam stub.
 */
export function defaultExportStore(): ExportStore {
  try {
    return mediaStore();
  } catch {
    return fsExportStore(process.env.MEDIA_ROOT ?? ".data/media");
  }
}
