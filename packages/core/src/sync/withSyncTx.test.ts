import { afterAll, describe, expect, it } from "vitest";
import { closeClient, collections } from "@agrorende/db";
import { setupTestDb } from "@agrorende/db/testing";

import { makeTestCtx } from "../testing/ctx";
import { withSyncTx } from "./withSyncTx";

describe("withSyncTx", () => {
  afterAll(async () => {
    await closeClient();
  });

  it("produces strictly increasing syncVersion values under 20 concurrent transactions", async () => {
    process.env.MONGODB_URI ??= "mongodb://localhost:27017";
    const handle = await setupTestDb("agrorende_core_test_sync");
    const ctx = makeTestCtx();
    await collections.syncCounters(handle.db).insertOne({ _id: ctx.orgId, value: 0, horizonVersion: 0 });

    try {
      const versions = await Promise.all(
        Array.from({ length: 20 }, () => withSyncTx(ctx, async (tx) => tx.syncVersion, handle.db)),
      );

      expect([...versions].sort((left, right) => left - right)).toEqual(
        Array.from({ length: 20 }, (_, index) => index + 1),
      );
    } finally {
      await handle.drop();
    }
  });
});
