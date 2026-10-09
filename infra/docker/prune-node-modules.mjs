#!/usr/bin/env node
/*
 * Image build step (T18): after `pnpm deploy --prod`, node_modules still holds every production
 * dependency of the workspace packages the app imports, although esbuild already inlined all of them
 * except the externals listed in `externals.json`. This keeps only the externals and their
 * transitive dependencies (dependencies, optionalDependencies and installed peerDependencies) and
 * deletes the rest.
 *
 *   node infra/docker/prune-node-modules.mjs <externals.json> <app dir>
 */
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

const [, , externalsFile, appDirArg] = process.argv;
if (externalsFile === undefined || appDirArg === undefined) {
  process.stderr.write("Usage: node infra/docker/prune-node-modules.mjs <externals.json> <app dir>\n");
  process.exit(2);
}

const appDir = path.resolve(appDirArg);
const rootModules = path.join(appDir, "node_modules");
const keep = new Set();

function resolvePackage(name, fromDir) {
  let dir = fromDir;
  for (;;) {
    const candidate = path.join(dir, "node_modules", name);
    if (existsSync(path.join(candidate, "package.json"))) return candidate;
    if (dir === appDir || dir === path.dirname(dir)) return undefined;
    dir = path.dirname(dir);
  }
}

function visit(name, fromDir, optional) {
  const pkgDir = resolvePackage(name, fromDir);
  if (pkgDir === undefined) {
    if (!optional) throw new Error(`Cannot resolve ${name} from ${fromDir}`);
    return;
  }
  if (keep.has(pkgDir)) return;
  keep.add(pkgDir);
  const manifest = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8"));
  for (const dep of Object.keys(manifest.dependencies ?? {})) visit(dep, pkgDir, false);
  for (const dep of Object.keys(manifest.optionalDependencies ?? {})) visit(dep, pkgDir, true);
  for (const dep of Object.keys(manifest.peerDependencies ?? {})) visit(dep, pkgDir, true);
}

for (const name of Object.keys(JSON.parse(readFileSync(externalsFile, "utf8")))) visit(name, appDir, false);

let removed = 0;
for (const entry of readdirSync(rootModules)) {
  if (entry.startsWith(".")) {
    if (entry !== ".bin") {
      rmSync(path.join(rootModules, entry), { recursive: true, force: true });
      removed += 1;
    }
    continue;
  }
  const names = entry.startsWith("@")
    ? readdirSync(path.join(rootModules, entry)).map((child) => path.join(entry, child))
    : [entry];
  for (const name of names) {
    const pkgDir = path.join(rootModules, name);
    if (!keep.has(pkgDir)) {
      rmSync(pkgDir, { recursive: true, force: true });
      removed += 1;
    }
  }
  if (entry.startsWith("@") && readdirSync(path.join(rootModules, entry)).length === 0) {
    rmSync(path.join(rootModules, entry), { recursive: true, force: true });
  }
}
rmSync(path.join(rootModules, ".bin"), { recursive: true, force: true });
process.stdout.write(`Kept ${keep.size} packages, removed ${removed} top-level entries.\n`);
