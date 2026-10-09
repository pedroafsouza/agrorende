import { describe, expect, it } from "vitest";

import type { Doc, JobContext, NotifyInput, WorkerCollection, WorkerPlatform } from "./index.js";
import { handler, localDay, lowStockKey } from "./stock.lowScan.js";

const ORG = "0190f5a0-0000-7000-8000-00000000a014";

function matches(row: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([key, value]) => {
    const actual = row[key];
    if (value !== null && typeof value === "object" && !(value instanceof Date)) {
      return Object.entries(value as Doc).every(([op, expected]) => {
        if (op === "$in") return (expected as unknown[]).includes(actual);
        if (op === "$nin") return !(expected as unknown[]).includes(actual);
        if (op === "$ne") return (actual ?? null) !== expected;
        return false;
      });
    }
    return (actual ?? null) === value;
  });
}

function collection(rows: Doc[]): WorkerCollection {
  return { find: (filter: Doc) => ({ toArray: async () => rows.filter((row) => matches(row, filter)) }) } as unknown as WorkerCollection;
}

function setup(now: Date) {
  const tables: Record<string, Doc[]> = {
    organizations: [{ _id: ORG, status: "ACTIVE", deletedAt: null, timezone: "America/Sao_Paulo" }],
    users: [
      { _id: "admin", organizationId: ORG, role: "ADMIN", isActive: true, deletedAt: null },
      { _id: "manager", organizationId: ORG, role: "MANAGER", isActive: true, deletedAt: null },
      { _id: "tech", organizationId: ORG, role: "FIELD", isActive: true, deletedAt: null },
    ],
    parts: [
      { _id: "filter", organizationId: ORG, name: "Filtro", sku: "F-1", minStock: 2, isActive: true, archivedAt: null, deletedAt: null },
      { _id: "belt", organizationId: ORG, name: "Correia", sku: "C-1", minStock: 1, isActive: true, archivedAt: null, deletedAt: null },
      { _id: "old", organizationId: ORG, name: "Antigo", sku: "A-1", minStock: 5, isActive: true, archivedAt: new Date(), deletedAt: null },
    ],
    stock_locations: [
      { _id: "wh", organizationId: ORG, name: "Almoxarifado", deletedAt: null },
      { _id: "van", organizationId: ORG, name: "Viatura", deletedAt: null },
    ],
    stock_levels: [
      { partId: "filter", stockLocationId: "wh", quantity: 2, organizationId: ORG, deletedAt: null },
      { partId: "filter", stockLocationId: "van", quantity: 3, organizationId: ORG, deletedAt: null },
      { partId: "belt", stockLocationId: "van", quantity: -1, organizationId: ORG, deletedAt: null },
      { partId: "old", stockLocationId: "wh", quantity: 0, organizationId: ORG, deletedAt: null },
    ],
  };
  const keys = new Set<string>();
  const redis = {
    set: async (key: string, _value: string, _mode: string, _ttl: number, nx: string) => {
      if (nx === "NX" && keys.has(key)) return null;
      keys.add(key);
      return "OK";
    },
  };
  const notified: NotifyInput[] = [];
  const platform = {
    keyPrefix: "agrorende:agrorende_t14",
    redis,
    table: (name: string) => collection(tables[name] ?? []),
    notify: async (_orgId: string, input: NotifyInput) => void notified.push(input),
  } as unknown as WorkerPlatform;
  const ctx: JobContext = { platform, now, logger: { info: () => undefined, warn: () => undefined, error: () => undefined } };
  return { ctx, notified, keys };
}

const job = { name: "stock.lowScan", data: {} };

describe("stock.lowScan", () => {
  it("notifies the office once per part, location and local day", async () => {
    const now = new Date("2026-03-01T12:00:00Z");
    const { ctx, notified, keys } = setup(now);
    expect(await handler(ctx, job)).toEqual({ orgs: 1, low: 2, notified: 2 });
    expect(notified.map((n) => n.entity.entityId).sort()).toEqual(["belt", "filter"]);
    expect(notified.every((n) => n.type === "LOW_STOCK" && n.entity.entityType === "PART")).toBe(true);
    expect(new Set(notified[0]?.userIds)).toEqual(new Set(["admin", "manager"]));
    expect(notified.find((n) => n.entity.entityId === "filter")?.params.title).toBe("Filtro · Almoxarifado");
    expect(keys.has(lowStockKey("agrorende:agrorende_t14", ORG, "filter", "wh", "2026-03-01"))).toBe(true);

    notified.length = 0;
    expect(await handler({ ...ctx, now: new Date("2026-03-01T20:00:00Z") }, job)).toEqual({ orgs: 1, low: 2, notified: 0 });
    // 02:30 UTC on 2 March is still 1 March in São Paulo.
    expect(await handler({ ...ctx, now: new Date("2026-03-02T02:30:00Z") }, job)).toEqual({ orgs: 1, low: 2, notified: 0 });
    expect(await handler({ ...ctx, now: new Date("2026-03-02T12:00:00Z") }, job)).toEqual({ orgs: 1, low: 2, notified: 2 });
  });

  it("uses the organisation-local calendar day", () => {
    expect(localDay(new Date("2026-03-02T02:30:00Z"), "America/Sao_Paulo")).toBe("2026-03-01");
    expect(localDay(new Date("2026-03-02T02:30:00Z"), "Not/AZone")).toBe("2026-03-01");
  });
});
