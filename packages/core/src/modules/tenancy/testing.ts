import { closeClient } from "@agrorende/db";
import { setupTestDb, type TestDbHandle } from "@agrorende/db/testing";

import { SEED } from "../../auth/testing/seeded.js";

export { SEED, seedCtx } from "../../auth/testing/seeded.js";

export type Row = { _id: string } & Record<string, unknown>;

const rawOf = (db: TestDbHandle["db"], name: string) => db.collection<Row>(name);

export interface TenancyTestDb {
  readonly handle: TestDbHandle;
  raw(name: string): ReturnType<typeof rawOf>;
  close(): Promise<void>;
}

interface SeedModule {
  seedDatabase(db: TestDbHandle["db"], options: { readonly force?: boolean }): Promise<unknown>;
}

/** Isolated, seeded database `agrorende_t20_<suffix>` (R6). Org A is ACTIVE, org B is TRIAL. */
export async function createTenancyDb(suffix: string): Promise<TenancyTestDb> {
  const name = `agrorende_t20_${suffix}`;
  process.env.MONGODB_URI ??= "mongodb://localhost:27017/?directConnection=true";
  process.env.MONGODB_DB = name;
  const handle = await setupTestDb(name);
  const seedPath = "../../../../db/seed/index.ts";
  const seed = (await import(/* @vite-ignore */ seedPath)) as SeedModule;
  await seed.seedDatabase(handle.db, { force: true });
  return {
    handle,
    raw: (collectionName: string) => rawOf(handle.db, collectionName),
    close: async () => {
      await handle.drop();
      await closeClient();
    },
  };
}

export const ORG_B_ADMIN = SEED.orgBUser;
