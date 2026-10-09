import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dueAtFor, slaSettingsOf } from "./sla.js";
import { createSeededDb, ORG_A, type SeededDb } from "./testing/seeded.js";

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
