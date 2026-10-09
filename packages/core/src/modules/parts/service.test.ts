import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ERROR_META } from "@agrorende/contracts/errors";

import { addPart, removePart } from "../workOrders/parts.js";
import { createManual } from "../workOrders/service.js";
import { createSeededDb, ctxOf, PEOPLE, seedUuid, type SeededDb } from "../workOrders/testing/seeded.js";
import {
  createLocation,
  createMovement,
  createPart,
  ledgerQuantity,
  levelQuantity,
  listLevels,
  listLocations,
  listMovements,
  listParts,
  lowStockEntries,
  updatePart,
  type MovementLike,
} from "./service.js";

let db: SeededDb;
const admin = ctxOf(PEOPLE.admin, "ADMIN");
const manager = ctxOf(PEOPLE.manager, "MANAGER");
const carlos = ctxOf(PEOPLE.carlos, "FIELD");
const pedro = ctxOf(PEOPLE.pedro, "FIELD");

let partId = "";
let warehouseId = "";
let carlosVanId = "";
let pedroVanId = "";

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

async function errorOf(promise: Promise<unknown>): Promise<{ code?: string; details?: Record<string, unknown> } | undefined> {
  try {
    await promise;
  } catch (error) {
    return error as { code?: string; details?: Record<string, unknown> };
  }
  return undefined;
}

/** Deterministic PRNG (mulberry32) so the property test is reproducible. */
function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

async function freshJob(assetIndex: number): Promise<string> {
  const created = await db.run((tx) =>
    createManual(tx, admin, { type: "CORRECTIVE", priority: "HIGH", title: "Filter change", assetId: seedUuid(assetIndex), assigneeId: PEOPLE.carlos }),
  );
  return created.id;
}

beforeAll(async () => {
  db = await createSeededDb("t14_parts");
  const part = await db.run((tx) => createPart(tx, admin, { sku: "FO-200", name: "Filtro de óleo", unit: "un", unitCostCents: 4_500, minStock: 2 }));
  partId = part.id;
  warehouseId = (await db.run((tx) => createLocation(tx, admin, { name: "Almoxarifado", type: "WAREHOUSE" }))).id;
  carlosVanId = (await db.run((tx) => createLocation(tx, admin, { name: "Viatura Carlos", type: "VAN", userId: PEOPLE.carlos }))).id;
  pedroVanId = (await db.run((tx) => createLocation(tx, manager, { name: "Viatura Pedro", type: "VAN", userId: PEOPLE.pedro }))).id;
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("catalog and locations", () => {
  it("rejects a duplicate SKU and lets the office archive a part", async () => {
    const duplicate = await errorOf(db.run((tx) => createPart(tx, admin, { sku: "FO-200", name: "Other" })));
    expect(duplicate?.code).toBe("VALIDATION_FAILED");
    const extra = await db.run((tx) => createPart(tx, admin, { sku: "CR-1", name: "Correia" }));
    const current = await db.raw("parts").findOne({ _id: extra.id });
    await db.run((tx) => updatePart(tx, admin, extra.id, { archived: true }, String(current?.syncVersion)));
    expect((await listParts(admin)).items.map((item) => item.id)).not.toContain(extra.id);
    expect((await listParts(admin, { includeArchived: true })).items.map((item) => item.id)).toContain(extra.id);
    expect(await codeOf(db.run((tx) => createPart(tx, carlos, { sku: "X-1", name: "X" })))).toBe("FORBIDDEN");
  });

  it("links a van to its technician, one van each, and shows a technician only their own van", async () => {
    expect((await db.raw("users").findOne({ _id: PEOPLE.carlos }))?.vanStockLocationId).toBe(carlosVanId);
    expect(await codeOf(db.run((tx) => createLocation(tx, admin, { name: "Second", type: "VAN", userId: PEOPLE.carlos })))).toBe("VALIDATION_FAILED");
    const seen = (await listLocations(carlos)).items.map((item) => item.id);
    expect(seen).toContain(warehouseId);
    expect(seen).toContain(carlosVanId);
    expect(seen).not.toContain(pedroVanId);
  });
});

describe("movements and levels", () => {
  it("keeps every level equal to the sum of its ledger (fixed-seed property test)", async () => {
    const random = prng(14);
    const locations = [warehouseId, carlosVanId, pedroVanId];
    const jobs = [await freshJob(433), await freshJob(434)];
    const liveWoParts: string[] = [];
    let ecRejections = 0;
    for (let step = 0; step < 60; step += 1) {
      const roll = random();
      const quantity = 1 + Math.floor(random() * 5);
      if (roll < 0.25) {
        const to = locations[Math.floor(random() * locations.length)] ?? warehouseId;
        await db.run((tx) => createMovement(tx, admin, { type: "IN", partId, quantity, toLocationId: to, unitCostCents: 4_500 }));
      } else if (roll < 0.45) {
        const from = locations[Math.floor(random() * locations.length)] ?? warehouseId;
        const to = locations.find((id) => id !== from) ?? warehouseId;
        await db.run((tx) => createMovement(tx, manager, { type: "TRANSFER", partId, quantity, fromLocationId: from, toLocationId: to }));
      } else if (roll < 0.55) {
        const at = locations[Math.floor(random() * locations.length)] ?? warehouseId;
        const sign = random() < 0.5 ? -1 : 1;
        await db.run((tx) => createMovement(tx, admin, { type: "ADJUSTMENT", partId, quantity: sign * quantity, toLocationId: at, note: "Count" }));
      } else if (roll < 0.85) {
        const available = await db.run((tx) => levelQuantity(tx, partId, carlosVanId));
        const id = crypto.randomUUID();
        const workOrderId = jobs[Math.floor(random() * jobs.length)] ?? jobs[0] ?? "";
        const result = await codeOf(
          db.run((tx) => addPart(tx, carlos, { id, workOrderId, name: "Filtro de óleo", quantity, unit: "un", partId, stockLocationId: carlosVanId }, new Date())),
        );
        if (available < quantity) {
          expect(result).toBe("WO_PART_NOT_IN_VAN_STOCK");
          expect(await db.raw("work_order_parts").findOne({ _id: id })).toBeNull();
          expect(await db.run((tx) => levelQuantity(tx, partId, carlosVanId))).toBe(available);
          ecRejections += 1;
        } else {
          expect(result).toBeUndefined();
          const after = await db.run((tx) => levelQuantity(tx, partId, carlosVanId));
          expect(after).toBe(available - quantity);
          expect(after).toBeGreaterThanOrEqual(0);
          liveWoParts.push(id);
        }
      } else if (liveWoParts.length > 0) {
        const index = Math.floor(random() * liveWoParts.length);
        const [id] = liveWoParts.splice(index, 1);
        if (id !== undefined) await db.run((tx) => removePart(tx, carlos, id, new Date()));
      }
    }
    const movements = (await db.raw("stock_movements").find({ partId }).toArray()) as unknown as MovementLike[];
    for (const locationId of locations) {
      const level = await db.run((tx) => levelQuantity(tx, partId, locationId));
      expect(level).toBe(ledgerQuantity(movements, partId, locationId));
    }
    expect(ecRejections + liveWoParts.length).toBeGreaterThan(0);
  });

  it("takes stock out for a work order line, prices it from the catalog and gives it back on removal", async () => {
    const start = await db.run((tx) => levelQuantity(tx, partId, carlosVanId));
    await db.run((tx) => createMovement(tx, admin, { type: "TRANSFER", partId, quantity: Math.max(3, 3 - start), fromLocationId: warehouseId, toLocationId: carlosVanId }));
    const before = await db.run((tx) => levelQuantity(tx, partId, carlosVanId));
    const workOrderId = await freshJob(435);
    const id = crypto.randomUUID();
    await db.run((tx) => addPart(tx, carlos, { id, workOrderId, name: "Filtro de óleo", quantity: 2, unit: "un", partId, stockLocationId: carlosVanId }, new Date()));
    expect(await db.run((tx) => levelQuantity(tx, partId, carlosVanId))).toBe(before - 2);
    expect((await db.raw("work_order_parts").findOne({ _id: id }))?.unitCostCents).toBe(4_500);
    const out = await db.raw("stock_movements").findOne({ workOrderPartId: id });
    expect(out?.type).toBe("OUT_TO_WORK_ORDER");
    expect(out?.workOrderId).toBe(workOrderId);
    await db.run((tx) => removePart(tx, carlos, id, new Date()));
    await db.run((tx) => removePart(tx, carlos, id, new Date()));
    expect(await db.run((tx) => levelQuantity(tx, partId, carlosVanId))).toBe(before);
    const lines = (await listMovements(admin, { partId })).items.filter((movement) => movement.workOrderPartId === id);
    expect(lines.map((movement) => movement.quantity).sort((a, b) => a - b)).toEqual([-2, 2]);
  });

  it("rejects a van shortfall with EC-WO-20 details and writes nothing", async () => {
    const workOrderId = await freshJob(436);
    const available = await db.run((tx) => levelQuantity(tx, partId, carlosVanId));
    const id = crypto.randomUUID();
    const error = await errorOf(
      db.run((tx) => addPart(tx, carlos, { id, workOrderId, name: "Filtro de óleo", quantity: available + 1, unit: "un", partId, stockLocationId: carlosVanId }, new Date())),
    );
    expect(error?.code).toBe("WO_PART_NOT_IN_VAN_STOCK");
    expect(error?.details).toMatchObject({ partId, stockLocationId: carlosVanId, available, requested: available + 1 });
    expect(await db.raw("work_order_parts").findOne({ _id: id })).toBeNull();
    expect(await db.raw("stock_movements").findOne({ workOrderPartId: id })).toBeNull();
  });

  it("keeps free-text lines working without touching stock", async () => {
    const workOrderId = await freshJob(437);
    const id = crypto.randomUUID();
    const count = await db.raw("stock_movements").countDocuments({});
    await db.run((tx) => addPart(tx, carlos, { id, workOrderId, name: "Abraçadeira", quantity: 4, unit: "un" }, new Date()));
    expect(await db.raw("stock_movements").countDocuments({})).toBe(count);
  });

  it("enforces roles: FIELD cannot post movements or take from another van", async () => {
    expect(await codeOf(db.run((tx) => createMovement(tx, carlos, { type: "IN", partId, quantity: 1, toLocationId: carlosVanId })))).toBe("FORBIDDEN");
    const workOrderId = await freshJob(438);
    await db.run((tx) => createMovement(tx, admin, { type: "IN", partId, quantity: 5, toLocationId: pedroVanId }));
    expect(
      await codeOf(
        db.run((tx) =>
          addPart(tx, carlos, { id: crypto.randomUUID(), workOrderId, name: "Filtro de óleo", quantity: 1, unit: "un", partId, stockLocationId: pedroVanId }, new Date()),
        ),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await codeOf(
        db.run((tx) =>
          addPart(tx, pedro, { id: crypto.randomUUID(), workOrderId, name: "Filtro de óleo", quantity: 1, unit: "un", partId, stockLocationId: pedroVanId }, new Date()),
        ),
      ),
    ).toBe("FORBIDDEN");
  });

  it("lists levels with the low flag and hides other vans from a technician", async () => {
    await db.run((tx) => createMovement(tx, admin, { type: "ADJUSTMENT", partId, quantity: -1_000, toLocationId: warehouseId, note: "Reset" }));
    const office = (await listLevels(admin, { partId })).items;
    expect(office.find((row) => row.stockLocationId === warehouseId)?.isLow).toBe(true);
    const field = (await listLevels(carlos, {})).items;
    expect(field.some((row) => row.stockLocationId === pedroVanId)).toBe(false);
    expect((await listLevels(admin, { low: true })).items.every((row) => row.isLow)).toBe(true);
  });
});

describe("helpers", () => {
  it("lowStockEntries flags levels at or below minStock and skips archived parts", () => {
    const entries = lowStockEntries(
      [
        { _id: "p1", name: "A", sku: "A", minStock: 2 },
        { _id: "p2", name: "B", sku: "B", minStock: 2, archivedAt: new Date() },
        { _id: "p3", name: "C", sku: "C", minStock: null },
      ],
      [{ _id: "l1", name: "W" }],
      [
        { partId: "p1", stockLocationId: "l1", quantity: 2 },
        { partId: "p2", stockLocationId: "l1", quantity: 0 },
        { partId: "p3", stockLocationId: "l1", quantity: 0 },
      ],
    );
    expect(entries.map((entry) => entry.partId)).toEqual(["p1"]);
  });

  it("EC-WO-20 is a sheet with the alternative and office recovery and copy in both locales", () => {
    const meta = ERROR_META.WO_PART_NOT_IN_VAN_STOCK;
    expect(meta.http).toBe(409);
    expect(meta.surface).toBe("sheet");
    expect(meta.recovery).toEqual(["ALT", "OFFICE"]);
    for (const locale of ["pt-BR", "en"]) {
      const url = new URL(`../../../../i18n/locales/${locale}/errors.json`, import.meta.url);
      const copy = JSON.parse(readFileSync(url, "utf8")) as Record<string, { title?: string; body?: string; action?: string }>;
      const entry = copy.WO_PART_NOT_IN_VAN_STOCK;
      expect(entry?.title?.length).toBeGreaterThan(0);
      expect(entry?.body?.length).toBeGreaterThan(0);
      expect(entry?.action?.length).toBeGreaterThan(0);
    }
  });
});
