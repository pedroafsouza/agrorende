import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeClient, collections } from "@agrorende/db";
import { setupTestDb, type TestDbHandle } from "@agrorende/db/testing";

import { costRollup, COST_NONE_KEY } from "./service.js";

const ORG = "0190f5a0-0000-7000-8000-0000000f5001";
const ASSET_A = "0190f5a0-0000-7000-8000-0000000f5101";
const ASSET_B = "0190f5a0-0000-7000-8000-0000000f5102";
const SEASON = "0190f5a0-0000-7000-8000-0000000f5201";
const OPERATOR = "0190f5a0-0000-7000-8000-0000000f5301";
const NOW = new Date("2026-10-08T15:00:00.000Z");

let seq = 0;
function uid(): string {
  seq += 1;
  return `0190f5a0-0000-7000-8000-1${String(seq).padStart(11, "0")}`;
}
function base() {
  return { _id: uid(), organizationId: ORG, syncVersion: 1, createdAt: NOW, updatedAt: NOW, deletedAt: null };
}

let handle: TestDbHandle;
const deps = () => ({ db: handle.db });

describe("costs rollup: fuel and external costs (T15.3)", () => {
  beforeAll(async () => {
    process.env.MONGODB_URI ??= "mongodb://localhost:27017/?directConnection=true";
    handle = await setupTestDb("agrorende_t15_costs");
  });

  afterAll(async () => {
    await handle.drop();
    await closeClient();
  });

  beforeEach(async () => {
    await handle.truncate();
    await collections.organizations(handle.db).insertOne({ _id: ORG, name: "Org", timezone: "America/Sao_Paulo", settings: {} } as never);
    await collections.assets(handle.db).insertMany([
      { ...base(), _id: ASSET_A, code: "TR-01", name: "Trator", category: "TRACTOR" } as never,
      { ...base(), _id: ASSET_B, code: "CO-01", name: "Colheitadeira", category: "HARVESTER" } as never,
    ]);
    await collections.seasons(handle.db).insertOne({ ...base(), _id: SEASON, name: "Safra 26/27", crop: "Soja" } as never);
    const completedAt = new Date("2026-10-05T15:00:00.000Z");
    await collections.workOrders(handle.db).insertMany([
      { ...base(), number: "OS-1", status: "COMPLETED", assetId: ASSET_A, seasonId: SEASON, completedAt, laborCostCents: 10_000, partsCostCents: 5_000, externalCostCents: 30_000 },
      { ...base(), number: "OS-2", status: "VERIFIED", assetId: ASSET_B, completedAt, laborCostCents: 0, partsCostCents: 0, externalCostCents: 12_500 },
      { ...base(), number: "OS-3", status: "IN_PROGRESS", assetId: ASSET_B, laborCostCents: 0, partsCostCents: 0, externalCostCents: 99_999 },
    ] as never);
    const fuel = (assetId: string, filledAt: string, totalCents: number | null, seasonId: string | null) => ({
      ...base(),
      assetId,
      liters: 100,
      pricePerLiterCents: totalCents === null ? null : totalCents / 100,
      totalCents,
      operatorId: OPERATOR,
      filledAt: new Date(filledAt),
      seasonId,
    });
    await collections.fuelLogs(handle.db).insertMany([
      fuel(ASSET_A, "2026-10-02T12:00:00.000Z", 60_000, SEASON),
      fuel(ASSET_A, "2026-10-06T12:00:00.000Z", 45_000, null),
      fuel(ASSET_B, "2026-10-07T12:00:00.000Z", 20_000, null),
      fuel(ASSET_B, "2026-10-07T13:00:00.000Z", null, null),
      fuel(ASSET_B, "2026-09-01T12:00:00.000Z", 77_000, SEASON),
    ] as never);
  });

  it("fills fuelCents and externalCents per asset and adds them to the total", async () => {
    const result = await costRollup({ orgId: ORG, role: "ADMIN" }, { groupBy: "asset", from: "2026-10-01", to: "2026-10-31" }, deps());
    const a = result.rows.find((row) => row.key === ASSET_A);
    const b = result.rows.find((row) => row.key === ASSET_B);
    expect(a).toMatchObject({ laborCents: 10_000, partsCents: 5_000, externalCents: 30_000, fuelCents: 105_000, totalCostCents: 150_000 });
    expect(b).toMatchObject({ externalCents: 12_500, fuelCents: 20_000, totalCostCents: 32_500 });
    expect(result.totals).toMatchObject({ externalCents: 42_500, fuelCents: 125_000, totalCostCents: 182_500 });
    expect(result.fuelLogCount).toBe(4);
  });

  it("puts seasonless fuel logs under 'Sem safra' / 'No season' instead of rejecting them", async () => {
    const pt = await costRollup({ orgId: ORG, role: "ADMIN" }, { groupBy: "season", from: "2026-10-01", to: "2026-10-31", locale: "pt-BR" }, deps());
    const seasonRow = pt.rows.find((row) => row.key === SEASON);
    const none = pt.rows.find((row) => row.key === COST_NONE_KEY);
    expect(seasonRow).toMatchObject({ label: "Safra 26/27", fuelCents: 60_000, externalCents: 30_000 });
    expect(none).toMatchObject({ label: "Sem safra", fuelCents: 65_000, externalCents: 12_500 });
    const en = await costRollup({ orgId: ORG, role: "ADMIN" }, { groupBy: "season", from: "2026-10-01", to: "2026-10-31", locale: "en" }, deps());
    expect(en.rows.find((row) => row.key === COST_NONE_KEY)?.label).toBe("No season");
  });

  it("filters fuel by asset for the mobile asset profile", async () => {
    const result = await costRollup({ orgId: ORG, role: "MANAGER" }, { groupBy: "asset", assetId: ASSET_B }, deps());
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ key: ASSET_B, fuelCents: 97_000, externalCents: 12_500 });
  });
});
