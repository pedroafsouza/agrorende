import type { Db } from "mongodb";

import { ensureIndexes } from "../src/ensureIndexes.js";

export const id = "0001_initial";

export async function up(db: Db): Promise<void> {
  await ensureIndexes(db);
}
