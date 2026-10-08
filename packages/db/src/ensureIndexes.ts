import type { Db } from "mongodb";

import { collection, COLLECTION_NAMES } from "./collections.js";
import { INDEXES } from "./indexes.js";

export async function ensureIndexes(db: Db): Promise<number> {
  for (const name of COLLECTION_NAMES) {
    const existing = await db.listCollections({ name }).next();
    if (existing === null) {
      await db.createCollection(name);
    }
  }

  let created = 0;
  for (const definition of INDEXES) {
    await collection(db, definition.collection).createIndex(definition.keys, definition.options);
    created += 1;
  }
  return created;
}
