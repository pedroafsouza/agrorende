import { defineConfig, devices } from "@playwright/test";

/** The e2e suite runs against the built static export (`out/`), served by scripts/serve.ts. */
const PORT = Number(process.env.SITE_E2E_PORT ?? 3191);
export const SITE_E2E_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "../../.data/e2e-results-site",
  fullyParallel: true,
  forbidOnly: process.env.CI !== undefined,
  retries: 0,
  timeout: 120_000,
  reporter: process.env.CI === undefined ? [["list"]] : [["list"], ["junit", { outputFile: "../../.data/junit-e2e-site.xml" }]],
  use: {
    baseURL: SITE_E2E_URL,
    locale: "pt-BR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", testMatch: /(pages|ctas)\.spec\.ts$/u, use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `tsx scripts/serve.ts --port ${PORT}`,
    url: `${SITE_E2E_URL}/pt-br/`,
    reuseExistingServer: process.env.CI === undefined,
    timeout: 30_000,
  },
});
