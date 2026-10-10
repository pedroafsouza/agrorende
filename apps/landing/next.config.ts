import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

import type { NextConfig } from "next";

// The site is built from apps/landing, so load the monorepo root `.env` without overriding variables
// already set in the shell (CI and the deploy workflow pass the public URLs explicitly).
const rootEnv = path.resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) {
  for (const [key, value] of Object.entries(parseEnv(readFileSync(rootEnv, "utf8")))) {
    if (process.env[key] === undefined && value !== undefined) process.env[key] = value;
  }
}

const nextConfig: NextConfig = {
  // ARCHITECTURE §22: a static export with no server runtime, no API routes and no image optimizer.
  output: "export",
  trailingSlash: true,
  poweredByHeader: false,
  reactStrictMode: true,
  images: { unoptimized: true },
  // Inlining the ~35 KB stylesheet removes a render-blocking round trip on slow mobile networks.
  experimental: { inlineCss: true },
  transpilePackages: ["@agrorende/contracts", "@agrorende/design-tokens", "@agrorende/i18n"],
  // The workspace packages use ESM `.js` specifiers for `.ts` sources (change request T04-005).
  webpack: (config: { resolve: { extensionAlias?: Record<string, string[]> } }) => {
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"], ".mjs": [".mts", ".mjs"] };
    return config;
  },
};

export default nextConfig;
