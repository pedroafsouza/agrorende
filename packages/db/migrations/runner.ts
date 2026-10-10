import type { Db } from "mongodb";

import { closeClient, getDb } from "../src/client";
import * as initial from "./0001_initial";
import * as notificationPrefs from "./0002-T05-008";
import * as perfQueryIndexes from "./0003-PERF-QUERIES";
import * as dropRedundantIndexes from "./0004-DROP-REDUNDANT-INDEXES";

interface MigrationRecord {
  readonly _id: string;
  readonly appliedAt: Date;
}

const migrations = [initial, notificationPrefs, perfQueryIndexes, dropRedundantIndexes] as const;

export async function runMigrations(db: Db): Promise<readonly string[]> {
  const ledger = db.collection<MigrationRecord>("_migrations");
  const applied: string[] = [];

  for (const migration of migrations) {
    const exists = await ledger.findOne({ _id: migration.id });
    if (exists !== null) continue;
    await migration.up(db);
    await ledger.insertOne({ _id: migration.id, appliedAt: new Date() });
    applied.push(migration.id);
  }

  return applied;
}

async function main(): Promise<void> {
  const db = await getDb();
  const applied = await runMigrations(db);
  process.stdout.write(`migrations applied: ${applied.length === 0 ? "none" : applied.join(", ")}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .finally(closeClient)
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
