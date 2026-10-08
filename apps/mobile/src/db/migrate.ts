import { migrationBundle } from "./drizzle/migrations";
import type { SqlDb } from "./sql";

export interface MigrationJournalEntry {
  readonly idx: number;
  readonly when: number;
  readonly tag: string;
  readonly breakpoints: boolean;
}

export interface MigrationBundle {
  readonly journal: { readonly entries: readonly MigrationJournalEntry[] };
  readonly migrations: Readonly<Record<string, string>>;
}

export interface PendingMigration {
  readonly key: string;
  readonly when: number;
  readonly statements: readonly string[];
}

/** Same bookkeeping table as drizzle's expo `useMigrations`, so both runners agree. */
const MIGRATIONS_TABLE = "__drizzle_migrations";

export const bundledMigrations: MigrationBundle = migrationBundle;

export function latestMigrationWhen(bundle: MigrationBundle = bundledMigrations): number {
  return bundle.journal.entries.reduce((max, entry) => Math.max(max, entry.when), 0);
}

async function lastAppliedWhen(db: SqlDb): Promise<number | undefined> {
  await db.exec(`CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (id INTEGER PRIMARY KEY AUTOINCREMENT, hash text NOT NULL, created_at numeric)`);
  const row = await db.get<{ created_at: number | string }>(`SELECT created_at FROM ${MIGRATIONS_TABLE} ORDER BY created_at DESC LIMIT 1`);
  return row === undefined ? undefined : Number(row.created_at);
}

export async function pendingMigrations(db: SqlDb, bundle: MigrationBundle = bundledMigrations): Promise<{ readonly fresh: boolean; readonly pending: readonly PendingMigration[] }> {
  const last = await lastAppliedWhen(db);
  const pending = bundle.journal.entries
    .filter((entry) => last === undefined || entry.when > last)
    .map((entry) => {
      const key = `m${String(entry.idx).padStart(4, "0")}`;
      const sql = bundle.migrations[key];
      if (sql === undefined) throw new Error(`missing migration ${key}`);
      return { key, when: entry.when, statements: sql.split("--> statement-breakpoint").map((part) => part.trim()).filter((part) => part.length > 0) };
    });
  return { fresh: last === undefined, pending };
}

/** Applies forward-only, additive migrations, each in its own transaction. */
export async function runMigrations(db: SqlDb, bundle: MigrationBundle = bundledMigrations, limit?: number): Promise<number> {
  const { pending } = await pendingMigrations(db, bundle);
  const toApply = limit === undefined ? pending : pending.slice(0, limit);
  for (const migration of toApply) {
    await db.transaction(async (tx) => {
      for (const statement of migration.statements) {
        await tx.exec(statement);
      }
      await tx.run(`INSERT INTO ${MIGRATIONS_TABLE} (hash, created_at) VALUES (?, ?)`, ["", migration.when]);
    });
  }
  return toApply.length;
}
