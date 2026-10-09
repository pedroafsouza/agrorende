import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// `pnpm dev` starts Next.js inside apps/web, so load the monorepo root `.env` without overriding
// variables already set in the shell (the realtime service and worker use `--env-file-if-exists`).
const rootEnv = path.resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) {
  for (const [key, value] of Object.entries(parseEnv(readFileSync(rootEnv, "utf8")))) {
    if (process.env[key] === undefined && value !== undefined) process.env[key] = value;
  }
}

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // Dev only: keep compiled pages in memory for an hour so long sessions (and the E2E suite) do not
  // recompile and reload a page that was disposed after the default 60 seconds of inactivity.
  onDemandEntries: { maxInactiveAge: 60 * 60 * 1000, pagesBufferLength: 100 },
  transpilePackages: ["@agrorende/contracts", "@agrorende/core", "@agrorende/db", "@agrorende/design-tokens", "@agrorende/i18n", "@agrorende/api-client"],
  // Native and Node-only server dependencies are loaded from node_modules at runtime instead of bundled.
  serverExternalPackages: ["@node-rs/argon2", "mongodb", "bullmq", "ioredis", "sharp", "qrcode"],
  // The workspace packages use ESM `.js` specifiers for `.ts` sources (change request T04-005).
  webpack: (config: { resolve: { extensionAlias?: Record<string, string[]> } }) => {
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"], ".mjs": [".mts", ".mjs"] };
    return config;
  },
};

// Server components call `useTranslations`, which needs the request config registered by the plugin.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
