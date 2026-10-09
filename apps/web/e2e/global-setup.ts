import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";

import { E2E_ENV, MEDIA_ROOT_ABS, REPO_ROOT, REVIEW_DIR } from "./support/env";

function run(command: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: REPO_ROOT, env: { ...process.env, ...E2E_ENV }, stdio: ["ignore", "inherit", "inherit"] });
    child.once("error", reject);
    child.once("close", (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited with ${String(code)}`))));
  });
}

/**
 * Resets the isolated E2E stack before every run (DELIVERY-PLAN T11): empties `.data/media-e2e`,
 * creates the storage layout, then `pnpm db:reset` drops `agrorende_e2e`, applies the migrations
 * (which ensure the indexes, the `setupTestDb` contract), seeds the demo data and runs
 * `storage:seed` with the same environment.
 */
export default async function globalSetup(): Promise<void> {
  if (E2E_ENV.MONGODB_DB !== "agrorende_e2e") throw new Error("E2E must run on agrorende_e2e.");
  await rm(MEDIA_ROOT_ABS, { recursive: true, force: true });
  await mkdir(MEDIA_ROOT_ABS, { recursive: true });
  await mkdir(REVIEW_DIR, { recursive: true });
  await run("pnpm", ["storage:init"]);
  await run("pnpm", ["db:reset"]);
}
