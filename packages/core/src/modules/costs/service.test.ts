import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeClient, collections } from "@agrorende/db";
import { setupTestDb, type TestDbHandle } from "@agrorende/db/testing";

import { DomainError } from "../../errors.js";
import { costRollup, COST_NONE_KEY } from "./service.js";

const ORG = "0190f5a0-0000-7000-8000-0000000c5001";
const OTHER = "0190f5a0-0000-7000-8000-0000000c5002";
const ASSET_A = "0190f5a0-0000-7000-8000-0000000c5101";
const ASSET_B = "0190f5a0-0000-7000-8000-0000000c5102";
const SEASON = "0190f5a0-0000-7000-8000-0000000c5201";
const PLOT = "0190f5a0-0000-7000-8000-0000000c5301";
const SITE = "0190f5a0-0000-7000-8000-0000000c5401";
const NOW = new Date("2026-10-08T15:00:00.000Z");

let seq = 0;
function uid(): string {
  seq += 1;
  return `0190f5a0-0000-7000-8000-${String(seq).padStart(12, "0")}`;
}
function base(orgId = ORG) {
  return { _id: uid(), organizationId: orgId, syncVersion: 1, createdAt: NOW, updatedAt: NOW, deletedAt: null };
}

let handle: TestDbHandle;
const deps = () => ({ db: handle.db });

describe("costs rollup", () => {
  beforeAll(async () => {
    process.env.MONGODB_URI ??= "mongodb://localhost:27017/?directConnection=true";
    handle = await setupTestDb("agrorende_t09_costs");
  });

  afterAll(async () => {
    await handle.drop();
    await closeClient();
  });

  beforeEach(async () => {
    await handle.truncate();
    await collections.organizations(handle.db).insertMany([
      { _id: ORG, name: "Org", timezone: "America/Sao_Paulo", settings: { showLaborCostToManager: false } } as never,
      { _id: OTHER, name: "Other", timezone: "America/Sao_Paulo", settings: {} } as never,
    ]);
    await collections.assets(handle.db).insertMany([
      { ...base(), _id: ASSET_A, code: "TR-01", name: "Trator", category: "TRACTOR" } as never,
      { ...base(), _id: ASSET_B, code: "CO-01", name: "Colheitadeira", category: "HARVESTER" } as never,
    ]);
    await collections.seasons(handle.db).insertOne({ ...base(), _id: SEASON, name: "Safra 26/27", crop: "Soja" } as never);
    await collections.plots(handle.db).insertOne({ ...base(), _id: PLOT, name: "Talhão 3", crop: "Milho", siteId: SITE } as never);
    await collections.sites(handle.db).insertOne({ ...base(), _id: SITE, name: "Fazenda Boa Vista", type: "FARM" } as never);
    const completedAt = new Date("2026-10-05T15:00:00.000Z");
    await collections.workOrders(handle.db).insertMany([
      { ...base(), number: "OS-1", status: "COMPLETED", assetId: ASSET_A, seasonId: SEASON, siteId: SITE, completedAt, laborCostCents: 10_000, partsCostCents: 5_000 },
      { ...base(), number: "OS-2", status: "VERIFIED", assetId: ASSET_A, plotId: PLOT, completedAt, laborCostCents: 2_000, partsCostCents: 1_000 },
      { ...base(), number: "OS-3", status: "COMPLETED", assetId: ASSET_B, completedAt: new Date("2026-08-01T15:00:00.000Z"), laborCostCents: 7_000, partsCostCents: 0 },
      { ...base(), number: "OS-4", status: "IN_PROGRESS", assetId: ASSET_B, laborCostCents: 99_999, partsCostCents: 0 },
      { ...base(OTHER), number: "OS-5", status: "COMPLETED", assetId: ASSET_A, completedAt, laborCostCents: 55_555, partsCostCents: 0 },
    ] as never);
    await collections.rentals(handle.db).insertMany([
      { ...base(), number: "LOC-1", direction: "OUTBOUND", status: "CLOSED", assetId: ASSET_B, seasonId: SEASON, closedAt: completedAt, chargesTotalCents: 40_000 },
      { ...base(), number: "LOC-2", direction: "INBOUND", status: "RETURNED", assetId: ASSET_A, closedAt: null, actualEnd: completedAt, chargesTotalCents: 8_000 },
      { ...base(), number: "LOC-3", direction: "OUTBOUND", status: "ACTIVE", assetId: ASSET_A, chargesTotalCents: 1_000_000 },
    ] as never);
  });

  it("rolls labour, parts, rent-in and revenue up per asset with tenant isolation", async () => {
    const result = await costRollup({ orgId: ORG, role: "ADMIN" }, { groupBy: "asset", from: "2026-10-01", to: "2026-10-31" }, deps());
    expect(result.laborVisible).toBe(true);
    expect(result.rows).toEqual([
      expect.objectContaining({ key: ASSET_A, label: "TR-01 · Trator", laborCents: 12_000, partsCents: 6_000, rentInCostCents: 8_000, totalCostCents: 26_000, rentalRevenueCents: 0 }),
      expect.objectContaining({ key: ASSET_B, laborCents: 0, partsCents: 0, totalCostCents: 0, rentalRevenueCents: 40_000 }),
    ]);
    expect(result.totals).toMatchObject({ laborCents: 12_000, partsCents: 6_000, externalCents: 0, fuelCents: 0, rentInCostCents: 8_000, totalCostCents: 26_000, rentalRevenueCents: 40_000 });
    expect(result.workOrderCount).toBe(2);
    expect(result.rentalCount).toBe(2);
  });

  it("puts seasonless costs under 'No season' instead of rejecting (T09.12)", async () => {
    const pt = await costRollup({ orgId: ORG, role: "ADMIN" }, { groupBy: "season", from: "2026-10-01", to: "2026-10-31", locale: "pt-BR" }, deps());
    expect(pt.rows.map((r) => [r.key, r.label])).toEqual([
      [SEASON, "Safra 26/27"],
      [COST_NONE_KEY, "Sem safra"],
    ]);
    const en = await costRollup({ orgId: ORG, role: "ADMIN" }, { groupBy: "season", from: "2026-10-01", to: "2026-10-31", locale: "en" }, deps());
    expect(en.rows.at(-1)?.label).toBe("No season");
    const onlyNone = await costRollup({ orgId: ORG, role: "ADMIN" }, { groupBy: "season", seasonId: COST_NONE_KEY }, deps());
    expect(onlyNone.rows.map((r) => r.key)).toEqual([COST_NONE_KEY]);
  });

  it("groups by category, crop, plot and site", async () => {
    const range = { from: "2026-10-01", to: "2026-10-31" };
    const category = await costRollup({ orgId: ORG, role: "ADMIN" }, { ...range, groupBy: "category" }, deps());
    expect(category.rows.map((r) => r.key).sort()).toEqual(["HARVESTER", "TRACTOR"]);
    const crop = await costRollup({ orgId: ORG, role: "ADMIN" }, { ...range, groupBy: "crop" }, deps());
    expect(Object.fromEntries(crop.rows.map((r) => [r.key, r.totalCostCents]))).toEqual({ Soja: 15_000, Milho: 3_000, [COST_NONE_KEY]: 8_000 });
    const plot = await costRollup({ orgId: ORG, role: "ADMIN" }, { ...range, groupBy: "plot" }, deps());
    expect(plot.rows.find((r) => r.key === PLOT)?.label).toBe("Talhão 3");
    const site = await costRollup({ orgId: ORG, role: "ADMIN" }, { ...range, groupBy: "site" }, deps());
    expect(site.rows.find((r) => r.key === SITE)?.totalCostCents).toBe(15_000);
  });

  it("hides labour from managers when the organisation says so", async () => {
    const result = await costRollup({ orgId: ORG, role: "MANAGER" }, { groupBy: "asset", from: "2026-10-01", to: "2026-10-31" }, deps());
    expect(result.laborVisible).toBe(false);
    expect(result.totals.laborCents).toBe(0);
    expect(result.totals.partsCents).toBe(6_000);
  });

  it("includes older work when no range is given and validates inputs", async () => {
    const all = await costRollup({ orgId: ORG, role: "ADMIN" }, {}, deps());
    expect(all.totals.laborCents).toBe(19_000);
    await expect(costRollup({ orgId: ORG, role: "ADMIN" }, { groupBy: "planet" }, deps())).rejects.toBeInstanceOf(DomainError);
    await expect(costRollup({ orgId: ORG, role: "ADMIN" }, { from: "yesterday" }, deps())).rejects.toBeInstanceOf(DomainError);
  });
});
