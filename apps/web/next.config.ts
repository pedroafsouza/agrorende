import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@agrorende/contracts", "@agrorende/core", "@agrorende/db", "@agrorende/design-tokens", "@agrorende/i18n", "@agrorende/api-client"],
  // Native and Node-only server dependencies are loaded from node_modules at runtime instead of bundled.
  serverExternalPackages: ["@node-rs/argon2", "mongodb", "bullmq", "ioredis", "sharp", "qrcode"],
  // The workspace packages use ESM `.js` specifiers for `.ts` sources (change request T04-005).
  webpack: (config: { resolve: { extensionAlias?: Record<string, string[]> } }) => {
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"], ".mjs": [".mts", ".mjs"] };
    return config;
  },
};

export default nextConfig;
