import { getMirrorRow, upsertMirrorRow } from "../../src/db/mirror";
import { findPartStockRejection, loadPartCatalog, searchCatalog, settlePartStockRejection, sortCatalog, stockCheck, type CatalogItem } from "../../src/features/jobs/parts/catalog";
import { listConflicts, recordConflict } from "../../src/sync/conflicts";
import { addPart, removePart } from "../../src/sync/mutators/jobs";
import { listOutbox } from "../../src/sync/outbox";
import { createTestRuntime, testId, USER_ID } from "../helpers/runtime";

jest.mock("react-native", () => ({ Linking: { openURL: jest.fn(), canOpenURL: jest.fn() }, Platform: { OS: "ios" } }));

const ISO = "2026-03-02T12:00:00.000Z";
const base = { organizationId: "org", syncVersion: 1, createdAt: ISO, updatedAt: ISO, deletedAt: null };

function item(overrides: Partial<CatalogItem>): CatalogItem {
  return { partId: testId(), sku: "", name: "", unit: "un", unitCostCents: null, vanLocationId: "van", vanQuantity: 0, ...overrides };
}

async function seedStock() {
  const { runtime } = await createTestRuntime();
  const ids = { wo: testId(), filter: testId(), hose: testId(), belt: testId(), van: testId(), other: testId(), warehouse: testId(), level: testId(), otherLevel: testId() };
  await upsertMirrorRow(runtime.db, "workOrders", { ...base, id: ids.wo, number: "OS-7", type: "CORRECTIVE", status: "IN_PROGRESS", priority: "HIGH", title: "Troca", assigneeId: USER_ID }, 0);
  await upsertMirrorRow(runtime.db, "parts", { ...base, id: ids.filter, sku: "FO-200", name: "Filtro de óleo", unit: "un", unitCostCents: 4_500, compatibleCategories: [], minStock: 1, isActive: true, archivedAt: null }, 0);
  await upsertMirrorRow(runtime.db, "parts", { ...base, id: ids.hose, sku: "MH-1", name: "Mangueira hidráulica", unit: "m", unitCostCents: null, compatibleCategories: [], minStock: 0, isActive: true, archivedAt: null }, 0);
  await upsertMirrorRow(runtime.db, "parts", { ...base, id: ids.belt, sku: "CR-9", name: "Correia antiga", unit: "un", unitCostCents: null, compatibleCategories: [], minStock: 0, isActive: false, archivedAt: ISO }, 0);
  await upsertMirrorRow(runtime.db, "stockLocations", { ...base, id: ids.van, name: "Viatura Carlos", type: "VAN", userId: USER_ID, siteId: null }, 0);
  await upsertMirrorRow(runtime.db, "stockLocations", { ...base, id: ids.other, name: "Viatura Pedro", type: "VAN", userId: testId(), siteId: null }, 0);
  await upsertMirrorRow(runtime.db, "stockLocations", { ...base, id: ids.warehouse, name: "Almoxarifado", type: "WAREHOUSE", userId: null, siteId: null }, 0);
  await upsertMirrorRow(runtime.db, "stockLevels", { ...base, id: ids.level, partId: ids.filter, stockLocationId: ids.van, quantity: 3 }, 0);
  await upsertMirrorRow(runtime.db, "stockLevels", { ...base, id: ids.otherLevel, partId: ids.hose, stockLocationId: ids.other, quantity: 9 }, 0);
  return { runtime, ids };
}

describe("catalog picker (WO-09 P1)", () => {
  test("lists the technician's van stock first and hides archived parts", async () => {
    const { runtime, ids } = await seedStock();
    const catalog = await loadPartCatalog(runtime.db, USER_ID);
    expect(catalog.vanLocationId).toBe(ids.van);
    expect(catalog.vanName).toBe("Viatura Carlos");
    expect(catalog.items.map((i) => [i.name, i.vanQuantity])).toEqual([
      ["Filtro de óleo", 3],
      ["Mangueira hidráulica", 0],
    ]);
  });

  test("a technician without a van sees the catalog with no van stock", async () => {
    const { runtime } = await seedStock();
    const catalog = await loadPartCatalog(runtime.db, testId());
    expect(catalog.vanLocationId).toBeNull();
    expect(catalog.items.every((i) => i.vanQuantity === 0 && i.vanLocationId === null)).toBe(true);
    expect(stockCheck(catalog.items[0] as CatalogItem, 1)).toBe("WO_PART_NOT_IN_VAN_STOCK");
  });

  test("searches by name or code without accents and sorts by van stock, then name", () => {
    const items = [item({ name: "Óleo 15W40", sku: "OL-1" }), item({ name: "Correia", sku: "CR-9", vanQuantity: 1 }), item({ name: "Arruela", sku: "AR-2", vanQuantity: 5 })];
    expect(searchCatalog(items, "oleo").map((i) => i.name)).toEqual(["Óleo 15W40"]);
    expect(searchCatalog(items, "cr-9").map((i) => i.name)).toEqual(["Correia"]);
    expect(searchCatalog(items, "  ")).toHaveLength(3);
    expect(sortCatalog(items).map((i) => i.name)).toEqual(["Arruela", "Correia", "Óleo 15W40"]);
  });

  test("EC-WO-20 device check: never more than the van holds", () => {
    expect(stockCheck({ vanLocationId: "van", vanQuantity: 3 }, 3)).toBeUndefined();
    expect(stockCheck({ vanLocationId: "van", vanQuantity: 3 }, 4)).toBe("WO_PART_NOT_IN_VAN_STOCK");
    expect(stockCheck({ vanLocationId: "van", vanQuantity: 0 }, 1)).toBe("WO_PART_NOT_IN_VAN_STOCK");
  });
});

describe("stock in the jobs mutator", () => {
  test("a catalog line lowers the van level at once and removing it puts the quantity back", async () => {
    const { runtime, ids } = await seedStock();
    const line = testId();
    await addPart({ id: line, workOrderId: ids.wo, name: "Filtro de óleo", quantity: 2, unit: "un", unitCostCents: 4_500, partId: ids.filter, stockLocationId: ids.van, partNumber: "FO-200" }, { runtime });
    expect(await getMirrorRow(runtime.db, "stockLevels", ids.level)).toMatchObject({ quantity: 1 });
    expect(await getMirrorRow(runtime.db, "workOrderParts", line)).toMatchObject({ partId: ids.filter, stockLocationId: ids.van });
    await removePart({ id: line }, { runtime });
    expect(await getMirrorRow(runtime.db, "stockLevels", ids.level)).toMatchObject({ quantity: 3 });
    await removePart({ id: line }, { runtime });
    expect(await getMirrorRow(runtime.db, "stockLevels", ids.level)).toMatchObject({ quantity: 3 });
  });

  test("a free-text line never moves stock", async () => {
    const { runtime, ids } = await seedStock();
    const line = testId();
    await addPart({ id: line, workOrderId: ids.wo, name: "Abraçadeira", quantity: 4, unit: "un" }, { runtime });
    await removePart({ id: line }, { runtime });
    expect(await getMirrorRow(runtime.db, "stockLevels", ids.level)).toMatchObject({ quantity: 3 });
    expect(await getMirrorRow(runtime.db, "stockLevels", ids.otherLevel)).toMatchObject({ quantity: 9 });
  });
});

describe("EC-WO-20 after sync", () => {
  test("a refused catalog line is found, the van level is restored and the command is dropped once handled", async () => {
    const { runtime, ids } = await seedStock();
    const line = testId();
    await addPart({ id: line, workOrderId: ids.wo, name: "Filtro de óleo", quantity: 2, unit: "un", partId: ids.filter, stockLocationId: ids.van }, { runtime });
    const [row] = await listOutbox(runtime.db);
    if (row === undefined) throw new Error("no outbox row");
    await runtime.db.run("UPDATE outbox SET status = 'REJECTED' WHERE id = ?", [row.id]);
    await recordConflict(runtime.db, { id: testId(), row, code: "WO_PART_NOT_IN_VAN_STOCK", now: ISO });

    expect(await findPartStockRejection(runtime.db, testId())).toBeUndefined();
    const rejection = await findPartStockRejection(runtime.db, ids.wo);
    expect(rejection).toMatchObject({ lineId: line, name: "Filtro de óleo", quantity: 2, unit: "un", partId: ids.filter, stockLocationId: ids.van });
    expect(await getMirrorRow(runtime.db, "stockLevels", ids.level)).toMatchObject({ quantity: 1 });

    await settlePartStockRejection(runtime.db, rejection as NonNullable<typeof rejection>, ISO);
    expect(await getMirrorRow(runtime.db, "stockLevels", ids.level)).toMatchObject({ quantity: 3 });
    expect(await listOutbox(runtime.db)).toEqual([]);
    expect(await listConflicts(runtime.db)).toEqual([]);
    expect(await findPartStockRejection(runtime.db, ids.wo)).toBeUndefined();
  });
});
