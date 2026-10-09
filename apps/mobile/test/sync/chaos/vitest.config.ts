import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(here, "../../..");

/**
 * Offline chaos suite (T12, ARCHITECTURE §15). Runs in Node with Vitest because the suite
 * loads the real `@agrorende/core` (ESM-only dependencies such as jose) next to the mobile
 * sync engine. Everything runs in one file, one process, against `agrorende_t12`.
 */
export default defineConfig({
  root: mobileRoot,
  test: {
    include: ["test/sync/chaos.test.ts", "test/sync/chaos/**/*.test.ts"],
    environment: "node",
    pool: "forks",
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    env: {
      MONGODB_DB: "agrorende_t12",
      MEDIA_ROOT: ".data/media-t12",
      REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
    },
  },
});
