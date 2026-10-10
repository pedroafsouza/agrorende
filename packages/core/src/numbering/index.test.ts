import { afterAll, describe, expect, it } from "vitest";
import { closeClient } from "@agrorende/db";
import { setupTestDb } from "@agrorende/db/testing";

import { makeTestCtx } from "../testing/ctx";
import { next } from "./index";

describe("numbering.next", () => {
  afterAll(async () => {
    await closeClient();
  });

  it("has no gaps or duplicates under concurrency", async () => {
    process.env.MONGODB_URI ??= "mongodb://localhost:27017";
    process.env.MONGODB_DB = "agrorende_core_test_numbering";
    const handle = await setupTestDb("agrorende_core_test_numbering");
    const ctx = makeTestCtx();

    try {
      const values = await Promise.all(Array.from({ length: 20 }, () => next(ctx, { key: "FR" })));
      expect([...values].sort((left, right) => left - right)).toEqual(
        Array.from({ length: 20 }, (_, index) => index + 1),
      );
    } finally {
      await handle.drop();
    }
  });
});
