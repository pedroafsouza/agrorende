import { defineConfig, devices } from "@playwright/test";

import { E2E_ENV, OIDC_CONTAINER, OIDC_JSON_CONFIG, OIDC_PORT, REALTIME_URL, REPO_ROOT, WEB_PORT, WEB_URL } from "./e2e/support/env";

// Specs, servers, global setup and helpers all read the isolated E2E environment.
Object.assign(process.env, E2E_ENV);

const serverEnv: Record<string, string> = Object.fromEntries(
  Object.entries({ ...process.env, ...E2E_ENV }).filter((entry): entry is [string, string] => entry[1] !== undefined),
);

const TABLET_SPECS = /(triage|ops)\.spec\.ts$/u;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "../../.data/e2e-results",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  // The specs share one seeded database and one dev server; running them in order keeps them deterministic.
  fullyParallel: false,
  workers: 1,
  forbidOnly: process.env.CI !== undefined,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI === undefined ? [["list"]] : [["list"], ["junit", { outputFile: "junit-e2e.xml" }]],
  use: {
    baseURL: WEB_URL,
    locale: "en-US",
    timezoneId: "America/Sao_Paulo",
    navigationTimeout: 90_000,
    actionTimeout: 20_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "env", testMatch: /env\.spec\.ts$/u, use: { ...devices["Desktop Chrome"] } },
    {
      name: "desktop",
      testIgnore: /env\.spec\.ts$/u,
      dependencies: ["env"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      // OPS-09: triage and the Ops Center also work on a 1024 × 768 tablet.
      name: "tablet",
      testMatch: TABLET_SPECS,
      dependencies: ["env"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 768 }, hasTouch: true },
    },
  ],
  webServer: [
    {
      name: "oidc",
      command: `docker rm -f ${OIDC_CONTAINER} >/dev/null 2>&1; exec docker run --rm --name ${OIDC_CONTAINER} -p ${OIDC_PORT}:8080 -e JSON_CONFIG='${OIDC_JSON_CONFIG}' ghcr.io/navikt/mock-oauth2-server:2.1.10`,
      url: `http://localhost:${OIDC_PORT}/google/.well-known/openid-configuration`,
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      name: "realtime",
      command: "pnpm --filter realtime start",
      cwd: REPO_ROOT,
      env: serverEnv,
      url: `${REALTIME_URL}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      name: "web",
      command: `pnpm exec next dev --webpack --port ${WEB_PORT}`,
      env: serverEnv,
      url: `${WEB_URL}/api/v1/health`,
      // Local iteration only: `E2E_REUSE_WEB=1` reuses an already compiled dev server on port 3100.
      reuseExistingServer: process.env.E2E_REUSE_WEB === "1" && process.env.CI === undefined,
      timeout: 240_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
