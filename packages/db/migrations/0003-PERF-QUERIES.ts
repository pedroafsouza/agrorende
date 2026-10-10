import type { Db } from "mongodb";

import { PERF_QUERY_INDEXES } from "../src/indexes.js";

export const id = "0003-PERF-QUERIES";

/** Change request PERF-QUERIES-001: sort-supporting indexes for the hot admin lists and counts. */
export async function up(db: Db): Promise<void> {
  for (const definition of PERF_QUERY_INDEXES) {
    await db.collection(definition.collection).createIndex(definition.keys, definition.options);
  }
}
