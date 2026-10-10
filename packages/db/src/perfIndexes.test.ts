import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as perfMigration from "../migrations/0003-PERF-QUERIES.js";
import { closeClient } from "./client.js";
import { PERF_QUERY_INDEXES } from "./indexes.js";
import { setupTestDb, type TestDbHandle } from "./testing/setupTestDb.js";

process.env.MONGODB_URI ??= "mongodb://localhost:27017/?replicaSet=rs0";

const ORG = "0190f5a0-0000-7000-8000-0000000e0001";

let handle: TestDbHandle;

beforeAll(async () => {
  handle = await setupTestDb("agrorende_perf");
}, 60_000);

afterAll(async () => {
  await handle.drop();
  await closeClient();
});

const keyOf = (keys: unknown) => JSON.stringify(keys);

async function indexKeys(collection: string): Promise<string[]> {
  return (await handle.db.collection(collection).listIndexes().toArray()).map((index) => keyOf(index.key));
}

interface PlanStage {
  readonly stage: string;
  readonly indexName?: string;
  readonly inputStage?: PlanStage;
  readonly inputStages?: readonly PlanStage[];
}

function stages(plan: PlanStage): PlanStage[] {
  return [plan, ...(plan.inputStage ? stages(plan.inputStage) : []), ...(plan.inputStages ?? []).flatMap(stages)];
}

describe("PERF-QUERIES indexes (migration 0003-PERF-QUERIES)", () => {
  it("creates every index on a database that predates it, and is idempotent", async () => {
    for (const definition of PERF_QUERY_INDEXES) {
      const name = (await handle.db.collection(definition.collection).listIndexes().toArray()).find((index) => keyOf(index.key) === keyOf(definition.keys))?.name;
      if (typeof name === "string") await handle.db.collection(definition.collection).dropIndex(name);
    }
    await perfMigration.up(handle.db);
    await perfMigration.up(handle.db);
    for (const definition of PERF_QUERY_INDEXES) {
      expect(await indexKeys(definition.collection)).toContain(keyOf(definition.keys));
    }
  });

  it("serves the ops activity feed and the work order list without an in-memory sort", async () => {
    const base = { organizationId: ORG, deletedAt: null, syncVersion: 1 };
    await handle.db.collection("activity_events").insertMany(
      Array.from({ length: 50 }, (_, i) => ({ _id: `ae-${i}` as never, ...base, occurredAt: new Date(Date.UTC(2026, 0, 1 + i)) })),
    );
    await handle.db.collection("work_orders").insertMany(
      Array.from({ length: 50 }, (_, i) => ({ _id: `wo-${i}` as never, ...base, status: "OPEN", createdAt: new Date(), dueAt: i % 5 === 0 ? null : new Date(Date.UTC(2026, 0, 1 + i)) })),
    );
    const feed = await handle.db
      .collection("activity_events")
      .find({ organizationId: ORG, deletedAt: null })
      .sort({ occurredAt: -1, _id: -1 })
      .limit(10)
      .explain("queryPlanner");
    const list = await handle.db
      .collection("work_orders")
      .find({ organizationId: ORG, deletedAt: null, dueAt: { $ne: null } })
      .sort({ dueAt: 1, createdAt: -1, _id: 1 })
      .limit(10)
      .explain("queryPlanner");
    for (const explained of [feed, list]) {
      const winning = stages(explained.queryPlanner.winningPlan as PlanStage);
      expect(winning.some((stage) => stage.stage === "SORT")).toBe(false);
      expect(winning.some((stage) => stage.stage === "IXSCAN")).toBe(true);
    }
  });
});
