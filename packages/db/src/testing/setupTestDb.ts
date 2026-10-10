import type { Db } from "mongodb";

import { getClient } from "../client";
import { COLLECTION_NAMES } from "../collections";
import { ensureIndexes } from "../ensureIndexes";

export interface TestDbHandle {
  readonly db: Db;
  readonly truncate: () => Promise<void>;
  readonly drop: () => Promise<void>;
}

export async function setupTestDb(name: string): Promise<TestDbHandle> {
  if (!/^agrorende_[a-z0-9_-]+$/u.test(name)) {
    throw new Error("Test database names must start with agrorende_ and contain only lowercase letters, numbers, _ or -.");
  }

  const client = await getClient();
  const db = client.db(name);
  await db.dropDatabase();
  await ensureIndexes(db);

  async function truncate(): Promise<void> {
    for (const collectionName of COLLECTION_NAMES) {
      await db.collection(collectionName).deleteMany({});
    }
    await ensureIndexes(db);
  }

  async function drop(): Promise<void> {
    await db.dropDatabase();
  }

  return { db, truncate, drop };
}
