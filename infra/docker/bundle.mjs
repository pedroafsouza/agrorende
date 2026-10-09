#!/usr/bin/env node
/*
 * Production bundler for the realtime, worker and migrate images (T18, ARCHITECTURE §18.2).
 *
 * The workspace packages ship TypeScript sources and the apps run them with `tsx` in development.
 * `tsx` is a dev dependency, so the image builder bundles the app entry together with every
 * `@agrorende/*` workspace module into plain ESM with esbuild. A short list of packages (native
 * addons, packages that read their own files, single-instance packages) stays external and is
 * resolved at runtime from the `node_modules` folder that `pnpm deploy --filter <app> --prod`
 * produces; `externals.json` records the version of each one so the image build can verify it.
 *
 *   node infra/docker/bundle.mjs realtime <outDir>
 *   node infra/docker/bundle.mjs worker <outDir>
 *   node infra/docker/bundle.mjs migrate <outDir>   (packages/db/migrations/runner.ts)
 *
 * The worker job registry imports every job module and the Apple revoke handler with literal
 * specifiers (change request T18-002), so the worker is one build with code splitting: the entry is
 * `dist/index.mjs` and lazily loaded modules become `dist/chunk-<hash>.mjs` next to it. The image's
 * package.json has `"type": "module"`.
 */
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const [, , app, outArg] = process.argv;

if ((app !== "realtime" && app !== "worker" && app !== "migrate") || outArg === undefined) {
  process.stderr.write("Usage: node infra/docker/bundle.mjs <realtime|worker|migrate> <outDir>\n");
  process.exit(2);
}

const outDir = path.resolve(outArg);

/**
 * Packages that stay external: native addons, packages that read their own files at runtime, and
 * packages that must be a single instance (react for @react-pdf). Everything else, including the
 * `@agrorende/*` workspace sources, is bundled. With the hoisted node linker one package can exist in
 * several versions (zod 3 at the root, zod 4 under the workspace packages), so bundling pure-JS
 * dependencies keeps the version each importer resolved at build time.
 */
const EXTERNAL_PACKAGES = new Set([
  "@node-rs/argon2",
  "@react-pdf/renderer",
  "@socket.io/redis-adapter",
  "bullmq",
  "expo-server-sdk",
  "ioredis",
  "mongodb",
  "pino",
  "react",
  "sharp",
  "socket.io",
]);

/** `name` or `@scope/name` from a bare specifier such as `date-fns/locale`. */
function packageName(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/** Version of the package that `resolvedFile` belongs to. */
function packageVersion(resolvedFile, name) {
  let dir = path.dirname(resolvedFile);
  while (dir !== path.dirname(dir)) {
    const manifest = path.join(dir, "package.json");
    if (existsSync(manifest)) {
      const json = JSON.parse(readFileSync(manifest, "utf8"));
      if (json.name === name && typeof json.version === "string") return json.version;
    }
    dir = path.dirname(dir);
  }
  throw new Error(`Cannot find the package.json of ${name} for ${resolvedFile}`);
}

/** External package name → version resolved at build time; checked by `verify-externals.mjs`. */
const externals = new Map();

const externalDependencies = {
  name: "external-dependencies",
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^[^./]/ }, async (args) => {
      if (args.pluginData?.probe === true || args.kind === "entry-point" || args.path.startsWith("node:")) return undefined;
      const name = packageName(args.path);
      if (!EXTERNAL_PACKAGES.has(name)) return undefined;
      const resolved = await pluginBuild.resolve(args.path, { kind: args.kind, resolveDir: args.resolveDir, pluginData: { probe: true } });
      if (resolved.errors.length > 0) return { errors: resolved.errors };
      const version = packageVersion(resolved.path, name);
      const known = externals.get(name);
      if (known !== undefined && known !== version) {
        return { errors: [{ text: `${name} resolves to both ${known} and ${version}; bundle it or align the versions` }] };
      }
      externals.set(name, version);
      return { path: args.path, external: true };
    });
  },
};

/** ESM output still meets CommonJS dependencies that call `require`, `__filename` or `__dirname`. */
const ESM_BANNER = [
  'import { createRequire as __agrorendeCreateRequire } from "node:module";',
  'import { fileURLToPath as __agrorendeFileURLToPath } from "node:url";',
  'import { dirname as __agrorendeDirname } from "node:path";',
  "const require = __agrorendeCreateRequire(import.meta.url);",
  "const __filename = __agrorendeFileURLToPath(import.meta.url);",
  "const __dirname = __agrorendeDirname(__filename);",
].join("\n");

const COMMON_OPTIONS = {
  absWorkingDir: repoRoot,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: "linked",
  legalComments: "none",
  logLevel: "warning",
  banner: { js: ESM_BANNER },
  plugins: [externalDependencies],
};

async function bundle(entry, outfile) {
  await build({
    ...COMMON_OPTIONS,
    entryPoints: [path.join(repoRoot, entry)],
    outfile,
  });
  process.stdout.write(`bundled ${entry} -> ${path.relative(outDir, outfile)}\n`);
}

if (app === "realtime") {
  await bundle("apps/realtime/src/index.ts", path.join(outDir, "dist/index.mjs"));
} else if (app === "migrate") {
  await bundle("packages/db/migrations/runner.ts", path.join(outDir, "dist/migrate.mjs"));
} else {
  // Code splitting keeps the lazily imported job modules in their own chunks while modules with
  // state (database client, queues, logger) still exist once in the process.
  await build({
    ...COMMON_OPTIONS,
    entryPoints: { index: path.join(repoRoot, "apps/worker/src/index.ts") },
    outdir: path.join(outDir, "dist"),
    outExtension: { ".js": ".mjs" },
    splitting: true,
    chunkNames: "chunk-[hash]",
  });
  process.stdout.write("bundled apps/worker/src/index.ts -> dist/index.mjs\n");
}

await writeFile(path.join(outDir, "externals.json"), `${JSON.stringify(Object.fromEntries([...externals].sort()), null, 2)}\n`);
