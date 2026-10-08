import { describe, expect, it } from "vitest";

import { AttentionResolveInputSchema, CostRollupDTOSchema, OpsKpisDTOSchema, OpsLiveDTOSchema } from "./index.js";

const at = "2025-01-01T12:00:00.000Z";

describe("ops and costs DTOs (T09-001)", () => {
  it("parses an Ops Center live frame", () => {
    const frame = {
      generatedAt: at,
      operators: [
        { userId: "u1", name: "Ana", lat: -22, lng: -47, accuracyM: 5, heading: null, speedMps: null, recordedAt: at, lastSeenAt: at, dutyStatus: "ON_DUTY", state: "WORKING", stale: false, deviceId: null, activeWorkOrderId: null },
      ],
      workOrders: [],
      reports: [],
      rentals: [],
      assets: [{ id: "a1", code: "TR-01", name: "Trator", condition: "OPERATIONAL", rentedOut: false, lat: -22, lng: -47 }],
    };
    expect(OpsLiveDTOSchema.safeParse(frame).success).toBe(true);
  });

  it("parses KPIs and rejects an unknown range", () => {
    const counts = { open_reports: 1, unassigned_wos: 0, in_progress: 0, done_today: 0, sla_at_risk: 0, active_rentals: 0, overdue_rentals: 0, on_duty: 2 };
    const kpis = { range: "today", generatedAt: at, counts, slaBreached: 0, slaCompliancePct: null, mttrHours: null, utilizationPct: 50 };
    expect(OpsKpisDTOSchema.safeParse(kpis).success).toBe(true);
    expect(OpsKpisDTOSchema.safeParse({ ...kpis, range: "1y" }).success).toBe(false);
    expect(OpsKpisDTOSchema.safeParse({ ...kpis, counts: { open_reports: 1 } }).success).toBe(false);
  });

  it("rejects an empty attention note", () => {
    expect(AttentionResolveInputSchema.safeParse({ note: "  " }).success).toBe(false);
    expect(AttentionResolveInputSchema.safeParse({ note: "Called the operator" }).success).toBe(true);
  });

  it("parses a cost roll-up", () => {
    const line = { laborCents: 100, partsCents: 0, externalCents: 0, fuelCents: 0, rentInCostCents: 0, totalCostCents: 100, rentalRevenueCents: 0 };
    const dto = { groupBy: "asset", from: null, to: at, laborVisible: true, rows: [{ key: "a1", label: "Trator", ...line }], totals: line, workOrderCount: 1, rentalCount: 0 };
    expect(CostRollupDTOSchema.safeParse(dto).success).toBe(true);
  });
});
