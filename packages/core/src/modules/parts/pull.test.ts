import type { PullResponse, TableName } from "@agrorende/contracts/sync";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Ctx } from "../../context.js";
import { pull } from "../../sync/pull.js";
import { createSeededDb, ctxOf, PEOPLE, type SeededDb } from "../workOrders/testing/seeded.js";
import { createLocation, createMovement, createPart } from "./service.js";

let db: SeededDb;
const admin = ctxOf(PEOPLE.admin, "ADMIN");
const carlos = ctxOf(PEOPLE.carlos, "FIELD");

async function pullTable(ctx: Ctx, table: TableName): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let cursor: string | undefined;
  for (let guard = 0; guard < 50; guard += 1) {
    const page: PullResponse = await pull(ctx, { deviceId: ctx.deviceId, scopeEpoch: 0, ...(cursor === undefined ? {} : { cursor }) });
    rows.push(...((page.changes[table] ?? []) as Record<string, unknown>[]));
    cursor = page.cursor;
    if (!page.hasMore || page.resetRequired) return rows;
  }
  throw new Error("pull did not converge");
}

beforeAll(async () => {
  db = await createSeededDb("t14_pull");
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("pull of stock for a technician (A§7.5)", () => {
  it("carries the catalog and locations, and levels of warehouses and the own van only", async () => {
    const part = await db.run((tx) => createPart(tx, admin, { sku: "FH-1", name: "Filtro hidráulico" }));
    const warehouse = await db.run((tx) => createLocation(tx, admin, { name: "Almoxarifado", type: "WAREHOUSE" }));
    const own = await db.run((tx) => createLocation(tx, admin, { name: "Viatura Carlos", type: "VAN", userId: PEOPLE.carlos }));
    const other = await db.run((tx) => createLocation(tx, admin, { name: "Viatura Pedro", type: "VAN", userId: PEOPLE.pedro }));
    for (const location of [warehouse, own, other]) {
      await db.run((tx) => createMovement(tx, admin, { type: "IN", partId: part.id, quantity: 4, toLocationId: location.id }));
    }

    expect((await pullTable(carlos, "parts")).map((row) => row.id)).toContain(part.id);
    const locations = new Set((await pullTable(carlos, "stockLocations")).map((row) => String(row.id)));
    expect(locations.has(own.id)).toBe(true);
    expect(locations.has(warehouse.id)).toBe(true);
    // Locations are whole-org rows (A§7.5); only the levels are limited to the own van and warehouses.
    expect(locations.has(other.id)).toBe(true);
    const levels = await pullTable(carlos, "stockLevels");
    const levelLocations = new Set(levels.map((row) => String(row.stockLocationId)));
    expect(levelLocations.has(own.id)).toBe(true);
    expect(levelLocations.has(warehouse.id)).toBe(true);
    expect(levelLocations.has(other.id)).toBe(false);
    expect(levels.find((row) => row.stockLocationId === own.id)?.quantity).toBe(4);
  });
});
