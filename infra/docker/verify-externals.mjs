#!/usr/bin/env node
/*
 * Image build check (T18): every package the bundle left external must resolve, from the bundle
 * folder, to the exact version esbuild resolved at build time (`externals.json` from bundle.mjs).
 *
 *   node infra/docker/verify-externals.mjs <externals.json> <bundle dir>
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const [, , externalsFile, bundleDirArg] = process.argv;
if (externalsFile === undefined || bundleDirArg === undefined) {
  process.stderr.write("Usage: node infra/docker/verify-externals.mjs <externals.json> <bundle dir>\n");
  process.exit(2);
}

const expected = JSON.parse(readFileSync(externalsFile, "utf8"));
const failures = [];

for (const [name, version] of Object.entries(expected)) {
  let dir = path.resolve(bundleDirArg);
  let found;
  while (found === undefined) {
    const manifest = path.join(dir, "node_modules", name, "package.json");
    if (existsSync(manifest)) found = JSON.parse(readFileSync(manifest, "utf8")).version;
    if (dir === path.dirname(dir)) break;
    dir = path.dirname(dir);
  }
  if (found !== version) failures.push(`${name}: expected ${version}, found ${found ?? "nothing"}`);
  else process.stdout.write(`external ${name}@${version} ok\n`);
}

if (failures.length > 0) {
  process.stderr.write(`External dependencies do not match the bundle:\n  ${failures.join("\n  ")}\n`);
  process.exit(1);
}
