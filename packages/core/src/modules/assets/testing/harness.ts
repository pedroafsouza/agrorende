import { closeClient, collections, withSyncTx, type SyncTx } from "@agrorende/db";
import { setupTestDb, type TestDbHandle } from "@agrorende/db/testing";

import { makeTestCtx, type TestCtx } from "../../../testing/ctx.js";
import { rawCollection, type RawCollection } from "../../../auth/testing/seeded.js";

export type Row = { _id: string } & Record<string, unknown>;


export interface Harness {
  readonly handle: TestDbHandle;
  readonly ctx: TestCtx;
  /** Untyped string-id collection for seeding rows owned by other modules. */
  raw(name: string): RawCollection;
  run<T>(fn: (tx: SyncTx) => Promise<T>, ctx?: TestCtx): Promise<T>;
  close(): Promise<void>;
}

/** Isolated database per test file: `agrorende_t04_<suffix>` (R6). */
export async function createHarness(suffix: string): Promise<Harness> {
  const name = `agrorende_t04_${suffix}`;
  process.env.MONGODB_URI ??= "mongodb://localhost:27017/?directConnection=true";
  process.env.MONGODB_DB = name;
  const handle = await setupTestDb(name);
  const ctx = makeTestCtx();
  const counters = collections.syncCounters(handle.db);
  await counters.insertOne({ _id: ctx.orgId, value: 0, horizonVersion: 0 });
  const other = makeTestCtx({ organizationId: "00000000-0000-7000-8000-0000000000ff" });
  await counters.insertOne({ _id: other.orgId, value: 0, horizonVersion: 0 });
  return {
    handle,
    ctx,
    raw: (name) => rawCollection(handle.db, name),
    run: (fn, runCtx = ctx) => withSyncTx({ orgId: runCtx.orgId }, fn, handle.db),
    close: async () => {
      await handle.drop();
      await closeClient();
    },
  };
}

export const OTHER_ORG_ID = "00000000-0000-7000-8000-0000000000ff";
