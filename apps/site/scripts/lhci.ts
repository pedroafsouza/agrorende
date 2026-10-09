/**
 * Runs Lighthouse CI (mobile preset, simulated throttling) against the built export with the
 * budgets in lighthouserc.json: performance ≥ 0.9, accessibility, best practices and SEO ≥ 0.95,
 * LCP < 2.5 s. Uses Playwright's Chromium when CHROME_PATH is not set, so no extra browser is needed.
 * Run `pnpm --filter site build` first.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportDir = path.resolve(root, "../../.data/lhci-site");

if (!existsSync(path.join(root, "out"))) {
  console.error("lhci: out/ is missing; run `pnpm --filter site build` first");
  process.exit(1);
}

const env = { ...process.env, CHROME_PATH: process.env.CHROME_PATH ?? chromium.executablePath() };
const result = spawnSync("lhci", ["autorun", "--config=lighthouserc.json"], { cwd: root, env, stdio: "inherit" });

interface ManifestEntry {
  readonly url: string;
  readonly summary: Record<string, number>;
}

const manifestFile = path.join(reportDir, "manifest.json");
if (existsSync(manifestFile)) {
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8")) as ManifestEntry[];
  for (const entry of manifest) {
    const scores = Object.entries(entry.summary)
      .map(([category, score]) => `${category} ${Math.round(score * 100)}`)
      .join(", ");
    console.log(`lhci: ${new URL(entry.url).pathname} — ${scores}`);
  }
  console.log(`lhci: ${readdirSync(reportDir).length} report files in ${reportDir}`);
}

process.exit(result.status ?? 1);
