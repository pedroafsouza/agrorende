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
 * The worker discovers the job files owned by other tasks by path (`apps/worker/src/jobs/<name>.{ts,js}`)
 * and loads the Apple revoke handler from `<repo>/packages/core/src/auth/apple.ts`, both relative to the
 * job registry module (change request T18-002). The worker output therefore mirrors the repository
 * layout below `<outDir>`: the main entry is `apps/worker/src/jobs/main.js`, every job file is emitted
 * next to it as `<name>.js`, shared code goes to `apps/worker/src/jobs/chunk-<hash>.js`, and
 * `packages/core/src/auth/apple.ts` is a one-line re-export of the bundled `apple.js` (Node 24 strips
 * the types of that file natively). The image's package.json has `"type": "module"`.
 */
import { existsSync, readFileSync } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
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
  // One build with code splitting: the main entry, every job file and the Apple handler share
  // chunks, so modules with state (database client, queues, logger) exist once in the process.
  // Chunks stay in the jobs folder because the job registry derives its folder from its own
  // import.meta.url, and the registry itself may end up in a chunk.
  const jobFiles = (await readdir(path.join(repoRoot, "apps/worker/src/jobs"))).filter(
    (file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && !file.endsWith(".d.ts") && file !== "index.ts",
  );
  const entryPoints = {
    "apps/worker/src/jobs/main": path.join(repoRoot, "apps/worker/src/index.ts"),
    "packages/core/src/auth/apple": path.join(repoRoot, "packages/core/src/auth/apple.ts"),
  };
  for (const file of jobFiles) {
    entryPoints[`apps/worker/src/jobs/${file.replace(/\.ts$/, "")}`] = path.join(repoRoot, "apps/worker/src/jobs", file);
  }
  await build({
    ...COMMON_OPTIONS,
    entryPoints,
    outdir: outDir,
    splitting: true,
    chunkNames: "apps/worker/src/jobs/chunk-[hash]",
  });
  await writeFile(
    path.join(outDir, "packages/core/src/auth/apple.ts"),
    '// Generated by infra/docker/bundle.mjs: the worker loads this path at runtime (change request T18-002).\nexport * from "./apple.js";\n',
  );
  process.stdout.write(`bundled worker: ${Object.keys(entryPoints).length} entries\n`);
}

await writeFile(path.join(outDir, "externals.json"), `${JSON.stringify(Object.fromEntries([...externals].sort()), null, 2)}\n`);
