import { afterAll, describe, expect, it } from "vitest";
import { closeClient, collections } from "@agrorende/db";
import { setupTestDb } from "@agrorende/db/testing";

describe("setupTestDb", () => {
  afterAll(async () => {
    await closeClient();
  });

  it("applies the initial migration to an isolated database", async () => {
    process.env.MONGODB_URI ??= "mongodb://localhost:27017";
    const handle = await setupTestDb("agrorende_t01");

    try {
      expect(handle.db.databaseName).toBe("agrorende_t01");
      const collectionNames = await handle.db.listCollections().map((collection) => collection.name).toArray();
      expect(collectionNames).toContain("sync_counters");
      expect(collectionNames).toContain("users");

      const userIndexes = await collections.users(handle.db).indexes();
      expect(userIndexes.length).toBeGreaterThan(1);
    } finally {
      await handle.drop();
    }
  });
});
