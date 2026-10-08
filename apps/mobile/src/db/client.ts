import { LocalError } from "../lib/errors";

import { pendingMigrations, runMigrations, type MigrationBundle, bundledMigrations } from "./migrate";
import { createSqlDb, type SqlDb, type SqlDriver } from "./sql";

export type { SqlDb } from "./sql";

export interface DatabaseHost {
  /** Opens (creating when needed) the SQLite file with the given name. */
  open(fileName: string): Promise<SqlDriver>;
  /** Deletes a file next to the databases if it exists (used for the backup copy). */
  removeFile(path: string): Promise<void>;
}

export interface OpenUserDatabaseInput {
  readonly userId: string;
  readonly host: DatabaseHost;
  /** OTA gate (ARCHITECTURE §7.10): false defers migrations until the bundle launched once. */
  readonly migrationsAllowed?: boolean;
  readonly bundle?: MigrationBundle;
}

export interface OpenedDatabase {
  readonly db: SqlDb;
  readonly fileName: string;
  readonly appliedMigrations: number;
  readonly backupPath?: string;
  readonly deferredMigrations: number;
}

export function userDatabaseFileName(userId: string): string {
  if (!/^[A-Za-z0-9-]+$/.test(userId)) throw new Error("invalid user id for database file");
  return `agrorende-${userId}.db`;
}

export function backupPathFor(dbPath: string): string {
  return `${dbPath}.bak`;
}

export async function quickCheck(db: SqlDb): Promise<boolean> {
  const rows = await db.all<{ quick_check?: string }>("PRAGMA quick_check");
  return rows.length === 1 && Object.values(rows[0] ?? {})[0] === "ok";
}

/**
 * Opens the per-user database (PLT-12): quick_check, copy before migrating, then
 * forward-only migrations. Failures surface as `LOCAL_DB_REPAIR_REQUIRED` or
 * `LOCAL_MIGRATION_FAILED`; tables are never dropped automatically.
 */
export async function openUserDatabase(input: OpenUserDatabaseInput): Promise<OpenedDatabase> {
  const fileName = userDatabaseFileName(input.userId);
  const driver = await input.host.open(fileName);
  const db = createSqlDb(driver);
  try {
    await db.exec("PRAGMA journal_mode = WAL");
  } catch (_error) {
    // In-memory and some test drivers do not support WAL; the default journal is fine.
  }
  const healthy = await quickCheck(db).catch(() => false);
  if (!healthy) {
    throw new LocalError("LOCAL_DB_REPAIR_REQUIRED");
  }

  const bundle = input.bundle ?? bundledMigrations;
  const { fresh, pending } = await pendingMigrations(db, bundle);
  if (pending.length === 0) {
    return { db, fileName, appliedMigrations: 0, deferredMigrations: 0 };
  }
  if (!fresh && input.migrationsAllowed === false) {
    return { db, fileName, appliedMigrations: 0, deferredMigrations: pending.length };
  }

  let backupPath: string | undefined;
  if (!fresh) {
    backupPath = backupPathFor(driver.path);
    try {
      await input.host.removeFile(backupPath);
      await db.run("VACUUM INTO ?", [backupPath]);
    } catch (cause) {
      throw new LocalError("LOCAL_MIGRATION_FAILED", { cause });
    }
  }
  try {
    const applied = await runMigrations(db, bundle);
    return { db, fileName, appliedMigrations: applied, backupPath, deferredMigrations: 0 };
  } catch (cause) {
    throw new LocalError("LOCAL_MIGRATION_FAILED", { cause });
  }
}
