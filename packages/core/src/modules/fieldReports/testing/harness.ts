import { closeClient, collections, withSyncTx, type SyncTx } from "@agrorende/db";
import { setupTestDb, type TestDbHandle } from "@agrorende/db/testing";

import { makeTestCtx, type TestCtx } from "../../../testing/ctx.js";
import { rawCollection, type RawCollection } from "../../../auth/testing/seeded.js";

export type Row = { _id: string } & Record<string, unknown>;


export interface Harness {
  readonly handle: TestDbHandle;
  readonly ctx: TestCtx;
  raw(name: string): RawCollection;
  run<T>(fn: (tx: SyncTx) => Promise<T>, ctx?: TestCtx): Promise<T>;
  close(): Promise<void>;
}

export const ORG_ID = "00000000-0000-7000-8000-000000000001";
export const ADMIN_ID = "00000000-0000-7000-8000-000000000002";
export const MANAGER_ID = "00000000-0000-7000-8000-000000000012";
export const OPERATOR_ID = "00000000-0000-7000-8000-000000000022";
export const OTHER_OPERATOR_ID = "00000000-0000-7000-8000-000000000032";
export const OTHER_ORG_ID = "00000000-0000-7000-8000-0000000000ff";

/** Isolated database per test file: `agrorende_t06_<suffix>` (R6). */
export async function createHarness(suffix: string): Promise<Harness> {
  const name = `agrorende_t06_${suffix}`;
  process.env.MONGODB_URI ??= "mongodb://localhost:27017/?directConnection=true";
  process.env.MONGODB_DB = name;
  const handle = await setupTestDb(name);
  const ctx = makeTestCtx({ userId: ADMIN_ID });
  const counters = collections.syncCounters(handle.db);
  await counters.insertOne({ _id: ORG_ID, value: 0, horizonVersion: 0 });
  await counters.insertOne({ _id: OTHER_ORG_ID, value: 0, horizonVersion: 0 });
  return {
    handle,
    ctx,
    raw: (collectionName) => rawCollection(handle.db, collectionName),
    run: (fn, runCtx = ctx) => withSyncTx({ orgId: runCtx.orgId }, fn, handle.db),
    close: async () => {
      await handle.drop();
      await closeClient();
    },
  };
}

export function userRow(id: string, role: string, name: string, orgId: string = ORG_ID): Row {
  const now = new Date();
  return {
    _id: id,
    organizationId: orgId,
    syncVersion: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    name,
    role,
    locale: "pt-BR",
    isActive: true,
    disabledAt: null,
    archivedAt: null,
  };
}
