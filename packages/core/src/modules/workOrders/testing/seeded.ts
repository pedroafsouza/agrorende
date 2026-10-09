import { closeClient, withSyncTx, type SyncTx } from "@agrorende/db";
import { setupTestDb, type TestDbHandle } from "@agrorende/db/testing";
import type { Role } from "@agrorende/contracts/enums";

import type { Ctx } from "../../../context.js";
import { rawCollection, type RawCollection } from "../../../auth/testing/seeded.js";

export const ORG_A = "018fd000-0000-7000-8000-000000000001";
export const ORG_B = "018fd000-0000-7000-8000-000000000002";

export function seedUuid(value: number): string {
  return `018fd000-0000-7000-8000-${value.toString(16).padStart(12, "0")}`;
}

/** Seeded people of the demo organisation (packages/db/seed). */
export const PEOPLE = {
  admin: seedUuid(100),
  manager: seedUuid(101),
  manager2: seedUuid(102),
  joana: seedUuid(103),
  carlos: seedUuid(104),
  pedro: seedUuid(105),
  lucas: seedUuid(106),
  rafael: seedUuid(107),
  invitee: seedUuid(108),
  orgBAdmin: seedUuid(109),
} as const;

export type Row = { _id: string } & Record<string, unknown>;


interface SeedModule {
  seedDatabase(db: TestDbHandle["db"], options: { readonly force?: boolean }): Promise<unknown>;
}

export interface SeededDb {
  readonly handle: TestDbHandle;
  raw(name: string): RawCollection;
  run<T>(fn: (tx: SyncTx) => Promise<T>, orgId?: string): Promise<T>;
  close(): Promise<void>;
}

/** Isolated, seeded database `agrorende_t07_<suffix>` (R6). */
export async function createSeededDb(suffix: string): Promise<SeededDb> {
  const name = `agrorende_t07_${suffix}`;
  process.env.MONGODB_URI ??= "mongodb://localhost:27017/?directConnection=true";
  process.env.MONGODB_DB = name;
  const handle = await setupTestDb(name);
  const seedPath = "../../../../../db/seed/index.ts";
  const seed = (await import(/* @vite-ignore */ seedPath)) as SeedModule;
  await seed.seedDatabase(handle.db, { force: true });
  return {
    handle,
    raw: (collectionName) => rawCollection(handle.db, collectionName),
    run: (fn, orgId = ORG_A) => withSyncTx({ orgId }, fn, handle.db),
    close: async () => {
      await handle.drop();
      await closeClient();
    },
  };
}

export function ctxOf(userId: string, role: Role, organizationId: string = ORG_A): Ctx {
  return { organizationId, orgId: organizationId, userId, role, deviceId: "018fd000-0000-7000-8000-00000000d007" };
}
