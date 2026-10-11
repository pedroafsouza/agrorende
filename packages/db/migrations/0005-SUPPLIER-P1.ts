import type { Db } from "mongodb";

import { PROVIDER_INDEXES } from "../src/indexes";

export const id = "0005-SUPPLIER-P1";

/** Provider network phase 1: indexes for `provider_invites` and `provider_reviews`. */
export async function up(db: Db): Promise<void> {
  for (const definition of PROVIDER_INDEXES) {
    await db.collection(definition.collection).createIndex(definition.keys, definition.options);
  }
}
