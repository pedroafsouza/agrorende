import { describe, expect, it, vi } from "vitest";

import type { Doc, JobContext, WorkerCollection, WorkerPlatform } from "./index.js";
import { createDueScanHandler, type DueScanOrg } from "./maintenance.dueScan.js";

function collection(rows: Doc[]): WorkerCollection {
  return {
    find: (filter: Doc) => ({
      toArray: async () => rows.filter((row) => !((filter.status as { $nin: string[] }).$nin.includes(String(row.status)))),
    }),
  } as unknown as WorkerCollection;
}

function context(now: Date) {
  const errors: Doc[] = [];
  const platform = {
    table: () =>
      collection([
        { _id: "org-a", status: "ACTIVE", deletedAt: null, timezone: "America/Sao_Paulo", settings: { slaHours: { MEDIUM: 48 } } },
        { _id: "org-b", status: "ACTIVE", deletedAt: null },
        { _id: "org-c", status: "SUSPENDED", deletedAt: null },
      ]),
  } as unknown as WorkerPlatform;
  const ctx: JobContext = { platform, now, logger: { info: () => undefined, warn: () => undefined, error: (_event, fields) => void errors.push(fields ?? {}) } };
  return { ctx, errors };
}

describe("maintenance.dueScan", () => {
  it("runs the core scan once per active organisation with its time zone and settings", async () => {
    const now = new Date("2026-10-10T12:00:00Z");
    const seen: DueScanOrg[] = [];
    const runOrg = vi.fn(async (org: DueScanOrg) => {
      seen.push(org);
      return { plans: 2, created: org.id === "org-a" ? [{ workOrderId: "wo-1" }] : [] };
    });
    const { ctx } = context(now);
    expect(await createDueScanHandler({ runOrg })(ctx, { name: "maintenance.dueScan", data: {} })).toEqual({ orgs: 2, plans: 4, created: 1, failed: 0 });
    expect(seen).toEqual([
      { id: "org-a", timeZone: "America/Sao_Paulo", settings: { slaHours: { MEDIUM: 48 } } },
      { id: "org-b", timeZone: undefined, settings: undefined },
    ]);
    expect(runOrg).toHaveBeenCalledWith(expect.anything(), now);
  });

  it("keeps scanning the other organisations when one fails, logging no personal data", async () => {
    const { ctx, errors } = context(new Date());
    const runOrg = vi.fn(async (org: DueScanOrg) => {
      if (org.id === "org-a") throw new TypeError("boom");
      return { plans: 1, created: [] };
    });
    expect(await createDueScanHandler({ runOrg })(ctx, { name: "maintenance.dueScan", data: {} })).toEqual({ orgs: 2, plans: 1, created: 0, failed: 1 });
    expect(errors).toEqual([{ orgId: "org-a", errorName: "TypeError" }]);
  });
});
