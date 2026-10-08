import { existsSync } from "node:fs";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface StorageInitResult {
  readonly root: string;
  readonly created: readonly string[];
}

let repoRootCache: string | null = null;

export function findRepoRoot(start = path.dirname(fileURLToPath(import.meta.url))): string {
  if (repoRootCache !== null) {
    return repoRootCache;
  }

  let current = start;
  while (true) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      repoRootCache = current;
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("Could not find repository root containing pnpm-workspace.yaml.");
    }
    current = parent;
  }
}

export function mediaRootFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const root = env.MEDIA_ROOT;
  if (root === undefined || root.trim().length === 0) {
    throw new Error("MEDIA_ROOT is required.");
  }
  return path.isAbsolute(root) ? root : path.resolve(findRepoRoot(), root);
}

async function assertWritable(directory: string): Promise<void> {
  const probe = path.join(directory, `.write-test-${process.pid}-${Date.now()}`);
  await writeFile(probe, "ok");
  await rm(probe);
}

export async function initStorage(root?: string): Promise<StorageInitResult> {
  const resolvedRoot = root ?? mediaRootFromEnv();
  const required = [resolvedRoot, path.join(resolvedRoot, ".tmp"), path.join(resolvedRoot, ".uploads")];
  const created: string[] = [];

  for (const directory of required) {
    try {
      await access(directory);
    } catch {
      await mkdir(directory, { recursive: true, mode: 0o750 });
      created.push(directory);
    }
    await assertWritable(directory);
  }

  return { root: resolvedRoot, created };
}
