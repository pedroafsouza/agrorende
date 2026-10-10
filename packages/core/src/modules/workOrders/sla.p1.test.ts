import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createFromSource, patch } from "./service";
import { dueAtFor, slaSettingsOf } from "./sla";
import { createSeededDb, ctxOf, ORG_A, PEOPLE, seedUuid, type SeededDb } from "./testing/seeded";

let db: SeededDb;
const HOUR_MS = 3_600_000;
const settings = slaSettingsOf({});
const zone = "America/Sao_Paulo";

beforeAll(async () => {
  db = await createSeededDb("t14_sla");
}, 60_000);

afterAll(async () => {
  await db.close();
});

async function windowHours(category: Parameters<typeof dueAtFor>[2], at: string): Promise<number> {
  const createdAt = new Date(at);
  const dueAt = await db.run((tx) => dueAtFor(tx, ORG_A, category, createdAt, "HIGH", settings, zone));
  return (dueAt.getTime() - createdAt.getTime()) / HOUR_MS;
}

describe("BR-F2-2 critical-window SLA (dueAtFor)", () => {
  it("halves the window for a listed category inside the critical window", async () => {
    expect(await windowHours("TRACTOR", "2026-10-15T12:00:00-03:00")).toBe(12);
  });

  it("keeps the default window for a category the window does not list", async () => {
    expect(await windowHours("TRUCK", "2026-10-15T12:00:00-03:00")).toBe(24);
  });

  it("keeps the default window outside the critical window, using the org-local day", async () => {
    expect(await windowHours("TRACTOR", "2026-12-15T12:00:00-03:00")).toBe(24);
    expect(await windowHours("TRACTOR", "2026-10-01T01:00:00Z")).toBe(24);
    expect(await windowHours("TRACTOR", "2026-10-01T03:30:00Z")).toBe(12);
  });

  it("keeps the default window for a job without an asset", async () => {
    expect(await windowHours(null, "2026-10-15T12:00:00-03:00")).toBe(24);
  });
});

describe("BR-F2-2 wiring in the work-order service (CR T14-001)", () => {
  const manager = ctxOf(PEOPLE.manager, "MANAGER");
  const tractor = seedUuid(400);
  const day = (offsetDays: number): string => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

  async function setWindow(categories: string[] | null): Promise<void> {
    const windows = categories === null ? [] : [{ name: "Test", startsOn: day(-2), endsOn: day(2), assetCategories: categories }];
    await db.raw("seasons").updateMany({ organizationId: ORG_A, isCurrent: true }, { $set: { criticalWindows: windows } });
  }

  async function createdWindowHours(): Promise<{ id: string; hours: number; version: number }> {
    const { id } = await db.run((tx) => createFromSource(tx, manager, { source: "MANUAL", type: "CORRECTIVE", priority: "HIGH", title: "SLA window", assetId: tractor }));
    const wo = await db.raw("work_orders").findOne({ _id: id });
    const dueAt = wo?.dueAt as Date;
    const createdAt = wo?.createdAt as Date;
    return { id, hours: (dueAt.getTime() - createdAt.getTime()) / HOUR_MS, version: wo?.syncVersion as number };
  }

  it("halves the default due date of a new job inside a critical window that lists the category", async () => {
    await setWindow(["TRACTOR"]);
    expect((await createdWindowHours()).hours).toBe(12);
  });

  it("keeps the default due date when the window does not list the category or there is no window", async () => {
    await setWindow(["TRUCK"]);
    expect((await createdWindowHours()).hours).toBe(24);
    await setWindow(null);
    expect((await createdWindowHours()).hours).toBe(24);
  });

  it("applies the window when the office resets the due date with PATCH dueAt: null", async () => {
    await setWindow(null);
    const created = await createdWindowHours();
    await setWindow(["TRACTOR"]);
    const patched = await db.run((tx) => patch(tx, manager, created.id, { dueAt: null }, `"${created.version}"`));
    expect((new Date(patched.dueAt ?? 0).getTime() - new Date(patched.createdAt).getTime()) / HOUR_MS).toBe(12);
  });
});
