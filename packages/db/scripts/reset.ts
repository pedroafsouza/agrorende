import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { closeClient, getDb, getDatabaseName } from "../src/client.js";
import { runMigrations } from "../migrations/runner.js";
import { seedDatabase } from "../seed/index.js";

async function runStorageSeed(): Promise<void> {
  const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
  await new Promise<void>((resolve, reject) => {
    const child = spawn("pnpm", ["storage:seed"], {
      cwd: repoRoot,
      env: process.env,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`pnpm storage:seed failed with ${signal === null ? `exit code ${code}` : `signal ${signal}`}.`));
    });
  });
}

export async function resetDatabase(): Promise<void> {
  if (process.env.APP_ENV === "production") {
    throw new Error("pnpm db:reset refuses to run when APP_ENV=production.");
  }

  const db = await getDb();
  const databaseName = getDatabaseName();
  await db.dropDatabase();
  process.stdout.write(`dropped database ${databaseName}\n`);

  const applied = await runMigrations(db);
  process.stdout.write(`migrations applied: ${applied.length === 0 ? "none" : applied.join(", ")}\n`);

  const seed = await seedDatabase(db);
  process.stdout.write(`seeded ${seed.documents} documents across ${seed.collections} collections; ensured ${seed.indexes} indexes\n`);

  await runStorageSeed();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  resetDatabase()
    .finally(closeClient)
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
