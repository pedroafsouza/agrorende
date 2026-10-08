import { File } from "expo-file-system";
import { openDatabaseAsync } from "expo-sqlite";

import type { DatabaseHost } from "./client";
import type { SqlDriver, SqlRow, SqlValue } from "./sql";

/** Production `SqlDriver` on top of expo-sqlite (ARCHITECTURE §7.1). */
export async function openExpoDriver(fileName: string): Promise<SqlDriver> {
  const db = await openDatabaseAsync(fileName);
  return {
    path: db.databasePath,
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params) => {
      const result = await db.runAsync(sql, [...params] as SqlValue[]);
      return { changes: result.changes, lastInsertRowId: result.lastInsertRowId };
    },
    all: (sql, params) => db.getAllAsync<SqlRow>(sql, [...params] as SqlValue[]),
    close: () => db.closeAsync(),
  };
}

export const expoDatabaseHost: DatabaseHost = {
  open: openExpoDriver,
  async removeFile(path) {
    const file = new File(path.startsWith("file://") ? path : `file://${path}`);
    if (file.exists) file.delete();
  },
};
