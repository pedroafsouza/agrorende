/**
 * Captures product screenshots of the admin web app for the public site (T19.6).
 *
 * The site ships with drawn placeholders from `assets/`. When the local stack runs
 * (`pnpm dev:setup` and `pnpm dev`, signed in as the seeded demo owner), this script saves
 * real screens to `.data/site-screenshots/` at 1600 × 1000 in both locales so a person can
 * pick, crop and commit them as new sources for `scripts/images.ts`. When the stack is not
 * reachable it only lists the screenshots that are still missing and exits successfully, so it
 * never blocks a build.
 *
 * Usage: `pnpm --filter site screenshots [--web http://localhost:3000] [--storage state.json]`.
 * `--storage` is a Playwright storage-state file of a signed-in demo session; it is read
 * from disk and never written by this script.
 */
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const outDir = join(root, ".data", "site-screenshots");

export interface Shot {
  readonly name: string;
  readonly path: string;
  /** Which placeholder in `assets/` the screenshot would replace. */
  readonly replaces: string;
}

export const SHOTS: readonly Shot[] = [
  { name: "attention", path: "/attention", replaces: "hero-field.svg" },
  { name: "work-orders", path: "/work-orders", replaces: "feature-f1.svg" },
  { name: "fuel", path: "/fuel", replaces: "feature-f2.svg" },
  { name: "rentals", path: "/rentals", replaces: "feature-f3.svg" },
  { name: "costs", path: "/costs", replaces: "feature-f4.svg" },
  { name: "sites", path: "/sites", replaces: "feature-f5.svg" },
];

export const SHOT_LOCALES = ["pt-BR", "en"] as const;

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function reachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(3000) });
    return response.status < 500;
  } catch {
    return false;
  }
}

function listMissing(reason: string): void {
  console.log(`screenshots: ${reason}; the site keeps its placeholders. Missing screenshots:`);
  for (const shot of SHOTS) console.log(`  - ${shot.name} (${shot.path}) would replace assets/${shot.replaces}`);
}

async function main(): Promise<void> {
  const web = argument("web") ?? process.env.WEB_URL ?? "http://localhost:3000";
  const storage = argument("storage");
  if (!(await reachable(web))) {
    listMissing(`the web app at ${web} is not reachable`);
    return;
  }
  if (storage === undefined) {
    listMissing("no --storage file with a signed-in demo session was given");
    return;
  }
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const locale of SHOT_LOCALES) {
      const context = await browser.newContext({ storageState: storage, locale, viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      for (const shot of SHOTS) {
        await page.goto(new URL(shot.path, web).toString(), { waitUntil: "networkidle" });
        const file = join(outDir, `${shot.name}-${locale}.png`);
        await page.screenshot({ path: file });
        console.log(`screenshots: ${file}`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
