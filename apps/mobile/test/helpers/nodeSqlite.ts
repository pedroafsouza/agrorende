import { DatabaseSync } from "node:sqlite";

import type { DatabaseHost } from "../../src/db/client";
import { createSqlDb, type SqlDb, type SqlDriver, type SqlRow, type SqlValue } from "../../src/db/sql";

/** `SqlDriver` over Node's built-in SQLite, used by the engine tests instead of expo-sqlite. */
export function nodeDriver(path = ":memory:"): SqlDriver {
  const db = new DatabaseSync(path);
  return {
    path,
    exec: async (sql) => {
      db.exec(sql);
    },
    run: async (sql, params) => {
      const result = db.prepare(sql).run(...(params as SqlValue[]));
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    all: async (sql, params) => db.prepare(sql).all(...(params as SqlValue[])) as SqlRow[],
    close: async () => {
      db.close();
    },
  };
}

export function memoryDb(): SqlDb {
  return createSqlDb(nodeDriver());
}

/** Host that keeps named in-memory databases alive so tests can reopen them. */
export function memoryHost(): DatabaseHost & { readonly removed: string[]; readonly opened: string[] } {
  const removed: string[] = [];
  const opened: string[] = [];
  return {
    removed,
    opened,
    async open(fileName) {
      opened.push(fileName);
      return nodeDriver();
    },
    async removeFile(path) {
      removed.push(path);
    },
  };
}
