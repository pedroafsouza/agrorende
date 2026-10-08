/**
 * Platform-agnostic SQLite access used by the sync engine (ARCHITECTURE §7.1).
 * Production wraps expo-sqlite; tests wrap Node's built-in `node:sqlite`.
 */
export type SqlValue = string | number | null;
export type SqlRow = Record<string, unknown>;

export interface RunResult {
  readonly changes: number;
  readonly lastInsertRowId: number;
}

/** Low-level driver. Calls may run concurrently; `createSqlDb` serialises them. */
export interface SqlDriver {
  readonly path: string;
  exec(sql: string): Promise<void>;
  run(sql: string, params: readonly SqlValue[]): Promise<RunResult>;
  all(sql: string, params: readonly SqlValue[]): Promise<SqlRow[]>;
  close(): Promise<void>;
}

export interface SqlDb {
  readonly path: string;
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly SqlValue[]): Promise<RunResult>;
  all<T extends SqlRow = SqlRow>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  get<T extends SqlRow = SqlRow>(sql: string, params?: readonly SqlValue[]): Promise<T | undefined>;
  /** Runs `fn` in one SQLite transaction. Nested calls use savepoints. */
  transaction<T>(fn: (tx: SqlDb) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

class Lock {
  private tail: Promise<void> = Promise.resolve();

  async acquire(): Promise<() => void> {
    let release: () => void = () => undefined;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = this.tail;
    this.tail = previous.then(() => next);
    await previous;
    return release;
  }
}

function handle(driver: SqlDriver, lock: Lock | undefined, depth: number): SqlDb {
  async function guarded<T>(work: () => Promise<T>): Promise<T> {
    if (lock === undefined) return work();
    const release = await lock.acquire();
    try {
      return await work();
    } finally {
      release();
    }
  }

  const db: SqlDb = {
    path: driver.path,
    exec: (sql) => guarded(() => driver.exec(sql)),
    run: (sql, params = []) => guarded(() => driver.run(sql, params)),
    all: <T extends SqlRow>(sql: string, params: readonly SqlValue[] = []) => guarded(async () => (await driver.all(sql, params)) as T[]),
    get: <T extends SqlRow>(sql: string, params: readonly SqlValue[] = []) => guarded(async () => (await driver.all(sql, params))[0] as T | undefined),
    transaction: <T>(fn: (tx: SqlDb) => Promise<T>) =>
      guarded(async () => {
        const inner = handle(driver, undefined, depth + 1);
        const savepoint = `sp_${depth}`;
        await driver.exec(depth === 0 ? "BEGIN IMMEDIATE" : `SAVEPOINT ${savepoint}`);
        try {
          const result = await fn(inner);
          await driver.exec(depth === 0 ? "COMMIT" : `RELEASE ${savepoint}`);
          return result;
        } catch (error) {
          await driver.exec(depth === 0 ? "ROLLBACK" : `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`);
          throw error;
        }
      }),
    close: () => guarded(() => driver.close()),
  };
  return db;
}

/** Wraps a driver so that a transaction never interleaves with unrelated statements. */
export function createSqlDb(driver: SqlDriver): SqlDb {
  return handle(driver, new Lock(), 0);
}

export function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

export function quoteIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`invalid SQL identifier: ${name}`);
  return `"${name}"`;
}
