import { closeClient, collection, COLLECTION_NAMES, type CollectionName } from "@agrorende/db";
import { setupTestDb, type TestDbHandle } from "@agrorende/db/testing";
import type { Role } from "@agrorende/contracts/enums";

import type { Ctx } from "../../context.js";

/** Seed identifiers (packages/db/seed). */
export const SEED = {
  orgA: "018fd000-0000-7000-8000-000000000001",
  orgB: "018fd000-0000-7000-8000-000000000002",
  admin: "018fd000-0000-7000-8000-000000000064",
  manager: "018fd000-0000-7000-8000-000000000065",
  field: "018fd000-0000-7000-8000-000000000068",
  invitee: "018fd000-0000-7000-8000-00000000006c",
  orgBUser: "018fd000-0000-7000-8000-00000000006d",
  password: "agrorende123",
  inviteCode: "K7QM2XPA9F",
} as const;

export function seedUuid(value: number): string {
  return `018fd000-0000-7000-8000-${value.toString(16).padStart(12, "0")}`;
}

export type Row = { _id: string } & Record<string, unknown>;

/**
 * Loosely typed, string-id view of a collection for seeding and asserting rows in tests. It goes
 * through the typed `@agrorende/db` accessor; only the document type is widened to `Row`.
 */
export function rawCollection(db: TestDbHandle["db"], name: string): ReturnType<typeof db.collection<Row>> {
  if (!isCollectionName(name)) {
    throw new Error(`Unknown collection ${name}.`);
  }
  return collection(db, name) as unknown as ReturnType<typeof db.collection<Row>>;
}

function isCollectionName(name: string): name is CollectionName {
  return (COLLECTION_NAMES as readonly string[]).includes(name);
}

export type RawCollection = ReturnType<typeof rawCollection>;

export interface SeededDb {
  readonly handle: TestDbHandle;
  raw(name: string): RawCollection;
  close(): Promise<void>;
}

interface SeedModule {
  seedDatabase(db: TestDbHandle["db"], options: { readonly force?: boolean }): Promise<unknown>;
}

/** Isolated, seeded database `agrorende_t02_<suffix>` (R6). */
export async function createSeededDb(suffix: string): Promise<SeededDb> {
  return createNamedSeededDb(`agrorende_t02_${suffix}`);
}

/** Isolated, seeded database with an explicit name (for example `agrorende_t10_oauth`). */
export async function createNamedSeededDb(name: string): Promise<SeededDb> {
  process.env.MONGODB_URI ??= "mongodb://localhost:27017/?directConnection=true";
  process.env.MONGODB_DB = name;
  const handle = await setupTestDb(name);
  const seedPath = "../../../../db/seed/index.ts";
  const seed = (await import(/* @vite-ignore */ seedPath)) as SeedModule;
  await seed.seedDatabase(handle.db, { force: true });
  return {
    handle,
    raw: (collectionName) => rawCollection(handle.db, collectionName),
    close: async () => {
      await handle.drop();
      await closeClient();
    },
  };
}

export function seedCtx(userId: string, role: Role, organizationId: string = SEED.orgA): Ctx {
  return { organizationId, orgId: organizationId, userId, role, deviceId: "018fd000-0000-7000-8000-00000000d001" };
}
