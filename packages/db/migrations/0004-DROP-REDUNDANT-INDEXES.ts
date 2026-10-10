import type { Db } from "mongodb";

import { REDUNDANT_INDEXES } from "../src/indexes";

export const id = "0004-DROP-REDUNDANT-INDEXES";

const keyOf = (keys: unknown): string => JSON.stringify(keys);

/**
 * Drops indexes whose keys are a prefix of a PERF-QUERIES index, so every query they served is
 * still served by the longer index. Idempotent: an index or collection that is already gone is skipped.
 */
export async function up(db: Db): Promise<void> {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((collection) => collection.name));
  for (const definition of REDUNDANT_INDEXES) {
    if (!existing.has(definition.collection)) continue;
    const collection = db.collection(definition.collection);
    const match = (await collection.listIndexes().toArray()).find((index) => keyOf(index.key) === keyOf(definition.keys));
    if (typeof match?.name === "string") await collection.dropIndex(match.name);
  }
}
