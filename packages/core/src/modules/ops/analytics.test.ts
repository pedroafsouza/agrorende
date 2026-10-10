import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeClient, collections } from "@agrorende/db";
import { setupTestDb, type TestDbHandle } from "@agrorende/db/testing";

import { DomainError } from "../../errors";
import { getAnalytics, plotBoundaries, search, weekKey, SEARCH_LIMIT, type AnalyticsDTO } from "./service";

const ORG = "0190f5a0-0000-7000-8000-0000000d1001";
const OTHER = "0190f5a0-0000-7000-8000-0000000d1002";
const ADMIN = "0190f5a0-0000-7000-8000-0000000d1101";
const OPERATOR = "0190f5a0-0000-7000-8000-0000000d1102";
const TECH = "0190f5a0-0000-7000-8000-0000000d1103";
const A1 = "0190f5a0-0000-7000-8000-0000000d1201";
const A2 = "0190f5a0-0000-7000-8000-0000000d1202";
const A3 = "0190f5a0-0000-7000-8000-0000000d1203";
const A4 = "0190f5a0-0000-7000-8000-0000000d1204";
const SEASON = "0190f5a0-0000-7000-8000-0000000d1301";
const NOW = new Date("2026-10-08T15:00:00.000Z");
// Monday 2026-09-28 to Sunday 2026-10-04 in America/Sao_Paulo: [2026-09-28T03:00Z, 2026-10-05T03:00Z).
const RANGE = { from: "2026-09-28", to: "2026-10-04" };
const CTX = { orgId: ORG, role: "ADMIN" as const };

let seq = 0;
function uid(): string {
  seq += 1;
  return `0190f5a0-0000-7000-8000-${String(900_000 + seq).padStart(12, "0")}`;
}

function at(iso: string): Date {
  return new Date(iso);
}

function base(orgId = ORG, createdAt = at("2026-09-01T12:00:00.000Z")) {
  return { _id: uid(), organizationId: orgId, syncVersion: 1, createdAt, updatedAt: createdAt, deletedAt: null };
}

function wo(fields: Record<string, unknown>, orgId = ORG) {
  const createdAt = (fields.createdAt as Date | undefined) ?? at("2026-09-01T12:00:00.000Z");
  return { ...base(orgId, createdAt), number: `OS-${seq}`, type: "CORRECTIVE", status: "COMPLETED", priority: "MEDIUM", title: "Troca de óleo", assigneeId: null, ...fields } as never;
}

function report(fields: Record<string, unknown>, orgId = ORG) {
  return { ...base(orgId), number: `RC-${seq}`, reporterId: OPERATOR, category: "ENGINE", priority: "MEDIUM", title: "Vazamento", status: "SUBMITTED", ...fields } as never;
}

function event(entityType: string, entityId: string, action: string, occurredAt: string, extra: Record<string, unknown> = {}, orgId = ORG) {
  return { ...base(orgId), entityType, entityId, action, actorId: ADMIN, occurredAt: at(occurredAt), receivedAt: at(occurredAt), meta: {}, fromStatus: null, toStatus: null, ...extra } as never;
}

function rental(fields: Record<string, unknown>, orgId = ORG) {
  return {
    ...base(orgId),
    number: `LOC-${seq}`,
    direction: "OUTBOUND",
    status: "ACTIVE",
    customerId: uid(),
    createdById: ADMIN,
    plannedStart: at("2026-09-01T12:00:00.000Z"),
    plannedEnd: at("2026-12-01T12:00:00.000Z"),
    rateCents: 10_000,
    rateUnit: "DAY",
    ...fields,
  } as never;
}

let handle: TestDbHandle;
const deps = () => ({ db: handle.db, now: NOW });

function values(dto: AnalyticsDTO): Record<string, number> {
  return Object.fromEntries(dto.series.map((point) => [point.key, point.value]));
}

/** The fixed fixture behind the known answers recorded in docs/progress/T16.md. */
async function seedFixture(): Promise<void> {
  const db = handle.db;
  await collections.organizations(db).insertMany([
    { _id: ORG, name: "Org", timezone: "America/Sao_Paulo", settings: {} } as never,
    { _id: OTHER, name: "Other", timezone: "America/Sao_Paulo", settings: {} } as never,
  ]);
  await collections.users(db).insertMany([
    { ...base(), _id: ADMIN, name: "Ana Admin", role: "ADMIN" } as never,
    { ...base(), _id: OPERATOR, name: "Olga Operadora", role: "FIELD" } as never,
    { ...base(), _id: TECH, name: "Tiago Técnico", role: "FIELD" } as never,
  ]);
  await collections.seasons(db).insertOne({ ...base(), _id: SEASON, name: "Safra 26", startsOn: "2026-09-28", endsOn: "2026-10-04", isCurrent: true, criticalWindows: [] } as never);
  await collections.assets(db).insertMany([
    { ...base(), _id: A1, code: "TR-01", name: "Trator 1", category: "TRACTOR", condition: "OPERATIONAL", isRentable: true } as never,
    { ...base(), _id: A2, code: "CO-02", name: "Colheitadeira 2", category: "HARVESTER", condition: "NEEDS_REPAIR", isRentable: false } as never,
    { ...base(), _id: A3, code: "PU-03", name: "Pulverizador 3", category: "SPRAYER", condition: "RETIRED", isRentable: true } as never,
    { ...base(), _id: A4, code: "TR-04", name: "Trator 4", category: "TRACTOR", condition: "OPERATIONAL", isRentable: true } as never,
  ]);

  // Completed WOs: 4 h, 24 h (reopened), 10 h (waited for parts), 2 h (safety hold only).
  const w1 = wo({ createdAt: at("2026-09-28T10:00:00.000Z"), completedAt: at("2026-09-28T14:00:00.000Z"), assigneeId: OPERATOR, workMinutes: 60, assetId: A1, seasonId: SEASON });
  const w2 = wo({ createdAt: at("2026-09-29T10:00:00.000Z"), completedAt: at("2026-09-30T10:00:00.000Z"), assigneeId: OPERATOR, workMinutes: 120, assetId: A1, status: "VERIFIED" });
  const w3 = wo({ createdAt: at("2026-10-01T10:00:00.000Z"), completedAt: at("2026-10-01T20:00:00.000Z"), assigneeId: TECH, workMinutes: 30, assetId: A2 });
  const w4 = wo({ createdAt: at("2026-10-02T10:00:00.000Z"), completedAt: at("2026-10-02T12:00:00.000Z"), assigneeId: OPERATOR, workMinutes: 90, assetId: A2, type: "PREVENTIVE" });
  await collections.workOrders(db).insertMany([
    w1,
    w2,
    w3,
    w4,
    // Outside the range, cancelled, still open and another tenant: all ignored.
    wo({ createdAt: at("2026-10-05T10:00:00.000Z"), completedAt: at("2026-10-06T10:00:00.000Z"), assigneeId: OPERATOR, workMinutes: 10 }),
    wo({ createdAt: at("2026-09-29T10:00:00.000Z"), completedAt: null, cancelledAt: at("2026-09-30T10:00:00.000Z"), status: "CANCELLED", assetId: A4 }),
    wo({ createdAt: at("2026-09-27T10:00:00.000Z"), completedAt: null, status: "IN_PROGRESS", assetId: A4, type: "PREVENTIVE" }),
    wo({ createdAt: at("2026-09-29T10:00:00.000Z"), completedAt: at("2026-09-29T11:00:00.000Z"), assigneeId: OPERATOR, workMinutes: 5, assetId: A1 }, OTHER),
  ]);
  const id = (doc: unknown) => (doc as { _id: string })._id;
  await collections.activityEvents(db).insertMany([
    event("WORK_ORDER", id(w2), "workOrder.reopen", "2026-09-29T20:00:00.000Z", { fromStatus: "COMPLETED", toStatus: "IN_PROGRESS" }),
    event("WORK_ORDER", id(w3), "workOrder.hold", "2026-10-01T12:00:00.000Z", { toStatus: "ON_HOLD", meta: { holdReason: "WAITING_PARTS" } }),
    event("WORK_ORDER", id(w4), "workOrder.hold", "2026-10-02T11:00:00.000Z", { toStatus: "ON_HOLD", meta: { holdReason: "SAFETY" } }),
    // A1: broken before the range, repaired 24 h into it.
    event("ASSET", A1, "asset.conditionChanged", "2026-09-27T03:00:00.000Z", { fromStatus: "OPERATIONAL", toStatus: "NEEDS_REPAIR" }),
    event("ASSET", A1, "asset.conditionChanged", "2026-09-28T15:00:00.000Z", { fromStatus: "NEEDS_REPAIR", toStatus: "IN_REPAIR" }),
    event("ASSET", A1, "asset.conditionChanged", "2026-09-29T03:00:00.000Z", { fromStatus: "IN_REPAIR", toStatus: "OPERATIONAL" }),
    // A2: broken 12 h before the end of the range and still down.
    event("ASSET", A2, "asset.conditionChanged", "2026-10-04T15:00:00.000Z", { fromStatus: "OPERATIONAL", toStatus: "NEEDS_REPAIR" }),
    // A3 is retired and therefore excluded from downtime.
    event("ASSET", A3, "asset.conditionChanged", "2026-09-28T03:00:00.000Z", { fromStatus: "OPERATIONAL", toStatus: "RETIRED" }),
  ]);

  await collections.fieldReports(db).insertMany([
    report({ receivedAt: at("2026-09-28T12:00:00.000Z"), occurredAt: at("2026-09-28T12:00:00.000Z"), assetId: A1, category: "ENGINE", seasonId: SEASON }),
    report({ receivedAt: at("2026-09-30T12:00:00.000Z"), occurredAt: at("2026-09-30T12:00:00.000Z"), assetId: A1, category: "ENGINE" }),
    report({ receivedAt: at("2026-10-03T12:00:00.000Z"), occurredAt: at("2026-10-03T12:00:00.000Z"), assetId: A1, category: "ENGINE" }),
    report({ receivedAt: at("2026-10-04T12:00:00.000Z"), occurredAt: at("2026-10-04T12:00:00.000Z"), assetId: A2, category: "HYDRAULIC" }),
    report({ receivedAt: at("2026-10-06T12:00:00.000Z"), occurredAt: at("2026-10-06T12:00:00.000Z"), assetId: A2, category: "ENGINE" }),
    report({ receivedAt: at("2026-09-30T12:00:00.000Z"), occurredAt: at("2026-09-30T12:00:00.000Z"), assetId: null, category: "ELECTRICAL" }, OTHER),
  ]);

  await collections.rentals(db).insertMany([
    // A1 rented 2026-09-26 → 2026-09-30: two days inside the range.
    rental({ assetId: A1, status: "RETURNED", actualStart: at("2026-09-26T03:00:00.000Z"), actualEnd: at("2026-09-30T03:00:00.000Z") }),
    // A4 rented since 2026-10-01 and still out: four days inside the range.
    rental({ assetId: A4, status: "ACTIVE", actualStart: at("2026-10-01T03:00:00.000Z"), actualEnd: null }),
    // Rent-in of A1 does not count towards utilisation.
    rental({ assetId: A1, direction: "INBOUND", status: "ACTIVE", actualStart: at("2026-09-28T03:00:00.000Z"), actualEnd: null }),
    // Revenue: R$ 1.000,00 in September, R$ 500,00 in October, R$ 300,00 rent-in cost in October.
    rental({ assetId: A4, status: "CLOSED", actualStart: at("2026-09-10T12:00:00.000Z"), actualEnd: at("2026-09-20T12:00:00.000Z"), closedAt: at("2026-09-30T12:00:00.000Z"), chargesTotalCents: 100_000 }),
    rental({ assetId: A3, status: "CLOSED", actualStart: at("2026-09-01T12:00:00.000Z"), actualEnd: at("2026-09-05T12:00:00.000Z"), closedAt: at("2026-10-02T12:00:00.000Z"), chargesTotalCents: 50_000 }),
    rental({ assetId: A2, direction: "INBOUND", status: "CLOSED", actualStart: at("2026-09-01T12:00:00.000Z"), actualEnd: at("2026-09-05T12:00:00.000Z"), closedAt: at("2026-10-01T12:00:00.000Z"), chargesTotalCents: 30_000 }),
    rental({ assetId: A3, status: "CLOSED", actualStart: at("2026-09-01T12:00:00.000Z"), actualEnd: at("2026-09-05T12:00:00.000Z"), closedAt: at("2026-10-10T12:00:00.000Z"), chargesTotalCents: 99_000 }),
  ]);
}

function code(error: unknown): string | undefined {
  return error instanceof DomainError ? error.code : undefined;
}

describe("analytics helpers", () => {
  it("keys weeks by their Monday in the organisation timezone", () => {
    expect(weekKey(at("2026-10-04T23:00:00.000Z"), "America/Sao_Paulo")).toBe("2026-09-28");
    expect(weekKey(at("2026-10-05T02:59:00.000Z"), "America/Sao_Paulo")).toBe("2026-09-28");
    expect(weekKey(at("2026-10-05T03:00:00.000Z"), "America/Sao_Paulo")).toBe("2026-10-05");
  });
});

describe("ops analytics, search and boundaries", () => {
  beforeAll(async () => {
    process.env.MONGODB_URI ??= "mongodb://localhost:27017/?directConnection=true";
    handle = await setupTestDb("agrorende_t16_analytics");
  });

  afterAll(async () => {
    await handle.drop();
    await closeClient();
  });

  beforeEach(async () => {
    await handle.truncate();
    await seedFixture();
  });

  it("answers MTTR as the weekly median of creation-to-completion hours", async () => {
    const dto = await getAnalytics(CTX, { metric: "mttr", ...RANGE }, deps());
    expect(dto.unit).toBe("hours");
    expect(dto.from).toBe("2026-09-28T03:00:00.000Z");
    expect(dto.to).toBe("2026-10-05T03:00:00.000Z");
    expect(dto.series).toEqual([{ key: "2026-09-28", label: "2026-09-28", value: 7, secondary: 4 }]);
    expect(dto.summary).toBe(7);
  });

  it("excludes reopened and waiting-for-parts WOs from the first-time fix rate", async () => {
    const dto = await getAnalytics(CTX, { metric: "first_time_fix", ...RANGE }, deps());
    expect(dto.unit).toBe("percent");
    expect(dto.summary).toBe(50);
    expect(dto.series[0]).toMatchObject({ value: 50, secondary: 4 });
  });

  it("counts field reports by category inside the range only", async () => {
    const dto = await getAnalytics(CTX, { metric: "reports_by_category", ...RANGE }, deps());
    expect(values(dto)).toEqual({ ENGINE: 3, HYDRAULIC: 1 });
    expect(dto.summary).toBe(4);
  });

  it("counts completed WOs per field user with their median work minutes", async () => {
    const dto = await getAnalytics(CTX, { metric: "wos_by_field_user", ...RANGE }, deps());
    expect(dto.series).toEqual([
      { key: OPERATOR, label: "Olga Operadora", value: 3, secondary: 90 },
      { key: TECH, label: "Tiago Técnico", value: 1, secondary: 30 },
    ]);
  });

  it("clips downtime to the range and leaves retired assets out", async () => {
    const dto = await getAnalytics(CTX, { metric: "downtime", ...RANGE }, deps());
    expect(values(dto)).toEqual({ [A1]: 24, [A2]: 12 });
    expect(dto.summary).toBe(36);
  });

  it("ranks the top failing assets by reports plus corrective WOs", async () => {
    const dto = await getAnalytics(CTX, { metric: "top_failing", ...RANGE }, deps());
    expect(dto.series).toEqual([
      { key: A1, label: "TR-01 · Trator 1", value: 5, secondary: 2 },
      { key: A2, label: "CO-02 · Colheitadeira 2", value: 2, secondary: 1 },
      { key: A4, label: "TR-04 · Trator 4", value: 1, secondary: 1 },
    ]);
  });

  it("measures rental utilisation of rentable assets from outbound rentals", async () => {
    const dto = await getAnalytics(CTX, { metric: "rental_utilization", ...RANGE }, deps());
    expect(values(dto)).toEqual({ [A1]: 28.6, [A4]: 57.1 });
    expect(dto.summary).toBe(42.9);
  });

  it("sums closed outbound rental revenue per month and reports rent-in cost apart", async () => {
    const dto = await getAnalytics(CTX, { metric: "rental_revenue", from: "2026-09-01", to: "2026-10-04" }, deps());
    expect(dto.series).toEqual([
      { key: "2026-09", label: "2026-09", value: 100_000, secondary: 0 },
      { key: "2026-10", label: "2026-10", value: 50_000, secondary: 30_000 },
    ]);
    expect(dto.summary).toBe(150_000);
  });

  it("delegates the cost metric to the cost roll-up", async () => {
    const dto = await getAnalytics(CTX, { metric: "cost", groupBy: "asset", ...RANGE }, deps());
    expect(dto.unit).toBe("cents");
    expect(dto.cost?.groupBy).toBe("asset");
    expect(dto.summary).toBe(dto.cost?.totals.totalCostCents);
  });

  it("filters by season and takes the season dates as the default range", async () => {
    const dto = await getAnalytics(CTX, { metric: "mttr", seasonId: SEASON }, deps());
    expect(dto.from).toBe("2026-09-28T03:00:00.000Z");
    expect(dto.to).toBe("2026-10-05T03:00:00.000Z");
    expect(dto.summary).toBe(4);
    const reports = await getAnalytics(CTX, { metric: "reports_by_category", seasonId: SEASON }, deps());
    expect(values(reports)).toEqual({ ENGINE: 1 });
  });

  it("rejects an unknown metric and an inverted range", async () => {
    await expect(getAnalytics(CTX, { metric: "nope" }, deps())).rejects.toSatisfy((e) => code(e) === "VALIDATION_FAILED");
    await expect(getAnalytics(CTX, { metric: "mttr", from: "2026-10-04", to: "2026-09-28" }, deps())).rejects.toSatisfy((e) => code(e) === "VALIDATION_FAILED");
    await expect(getAnalytics(CTX, { metric: "mttr", seasonId: "018fd000-0000-7000-8000-0000000fffff" }, deps())).rejects.toSatisfy((e) => code(e) === "NOT_FOUND");
  });

  it("searches every type, caps each at five and never leaks another tenant", async () => {
    const db = handle.db;
    await collections.assets(db).insertMany(
      Array.from({ length: 7 }, (_, i) => ({ ...base(), code: `PL-${i}`, name: `Plantadeira ${i}`, category: "PLANTER", condition: "OPERATIONAL", isRentable: false }) as never),
    );
    await collections.assets(db).insertOne({ ...base(OTHER), code: "PL-X", name: "Plantadeira alheia", category: "PLANTER", condition: "OPERATIONAL" } as never);
    await collections.customers(db).insertOne({ ...base(), name: "Fazenda Boa Vista", taxId: "12345678000190" } as never);
    await collections.sites(db).insertOne({ ...base(), name: "Sede Plantadeira", type: "FARM", city: "Rio Verde" } as never);

    const hits = await search({ orgId: ORG }, "plantadeira", deps());
    expect(hits.assets).toHaveLength(SEARCH_LIMIT);
    expect(hits.assets.every((hit) => hit.href.startsWith("/assets/") && !hit.title.includes("alheia"))).toBe(true);
    expect(hits.sites.map((hit) => hit.title)).toEqual(["Sede Plantadeira"]);

    const byTaxId = await search({ orgId: ORG }, "12.345.678", deps());
    expect(byTaxId.customers.map((hit) => hit.title)).toEqual(["Fazenda Boa Vista"]);
    const byPlate = await search({ orgId: ORG }, "tr-0", deps());
    expect(byPlate.assets.map((hit) => hit.title)).toEqual(expect.arrayContaining(["TR-01 · Trator 1", "TR-04 · Trator 4"]));
    const wos = await search({ orgId: ORG }, "óleo", deps());
    expect(wos.workOrders.length).toBe(SEARCH_LIMIT);
    expect((await search({ orgId: ORG }, "a", deps())).assets).toEqual([]);
    expect((await search({ orgId: ORG }, "(.*", deps())).assets).toEqual([]);
  });

  it("answers a search over a seed-sized dataset in under 300 ms", async () => {
    const db = handle.db;
    await collections.assets(db).insertMany(Array.from({ length: 400 }, (_, i) => ({ ...base(), code: `BK-${i}`, name: `Máquina ${i}`, category: "OTHER", condition: "OPERATIONAL" }) as never));
    await collections.workOrders(db).insertMany(Array.from({ length: 1_000 }, (_, i) => wo({ number: `OS-9${i}`, title: `Serviço ${i}`, status: "OPEN" })));
    await collections.fieldReports(db).insertMany(Array.from({ length: 1_000 }, (_, i) => report({ number: `RC-9${i}`, title: `Relato ${i}`, receivedAt: NOW, occurredAt: NOW })));
    await search({ orgId: ORG }, "warm", deps());
    const started = performance.now();
    const hits = await search({ orgId: ORG }, "99", deps());
    const elapsed = performance.now() - started;
    expect(hits.workOrders).toHaveLength(SEARCH_LIMIT);
    expect(elapsed).toBeLessThan(300);
  });

  it("serves plot boundaries as GeoJSON for the Ops map", async () => {
    const db = handle.db;
    const ring = [
      [-50.9, -17.8],
      [-50.89, -17.8],
      [-50.89, -17.79],
      [-50.9, -17.8],
    ];
    const site = uid();
    await collections.plots(db).insertMany([
      { ...base(), siteId: site, name: "Talhão 1", areaHa: 110.5, crop: "SOY", boundary: { type: "Polygon", coordinates: [ring] } } as never,
      { ...base(), siteId: site, name: "Talhão 2", boundary: null } as never,
      { ...base(), siteId: site, name: "Talhão 3", archivedAt: NOW, boundary: { type: "Polygon", coordinates: [ring] } } as never,
      { ...base(OTHER), siteId: site, name: "Alheio", boundary: { type: "Polygon", coordinates: [ring] } } as never,
    ]);
    const dto = await plotBoundaries({ orgId: ORG }, deps());
    expect(dto.type).toBe("FeatureCollection");
    expect(dto.features.map((f) => f.properties.name)).toEqual(["Talhão 1"]);
    expect(dto.features[0]?.properties).toMatchObject({ siteId: site, crop: "SOY", areaHa: 110.5 });
  });
});
