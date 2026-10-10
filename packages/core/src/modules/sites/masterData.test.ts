import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { newId } from "../assets/kit";
import { createAsset } from "../assets/service";
import { createHarness, type Harness } from "../assets/testing/harness";
import { getTemplate } from "../checklists/queries";
import { createTemplate, defaultTemplateId, deleteTemplate, publishTemplate, snapshotPublished, updateTemplate } from "../checklists/service";
import { getCustomer, listCustomers } from "../customers/queries";
import { createCustomer, deleteCustomer, getForEligibility, updateCustomer } from "../customers/service";
import { closeSeason, createSeason, criticalWindowFor, currentSeasonId, findCriticalWindow, updateSeason } from "../seasons/service";
import { ringMetrics, validatePlotGeometry } from "./geometry";
import { createPlot, createSite, deleteSite, getSummary, updateSite } from "./service";

let h: Harness;

beforeAll(async () => {
  h = await createHarness("master");
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  for (const name of ["assets", "sites", "plots", "seasons", "customers", "checklist_templates", "work_orders", "rentals", "activity_events", "inspections"]) {
    await h.raw(name).deleteMany({});
  }
});

function row(extra: Record<string, unknown>) {
  const now = new Date();
  return { _id: newId(), organizationId: h.ctx.orgId, syncVersion: 1, createdAt: now, updatedAt: now, deletedAt: null, ...extra };
}

const SQUARE: [number, number][] = [
  [-47.0, -22.0],
  [-46.99, -22.0],
  [-46.99, -21.99],
  [-47.0, -21.99],
  [-47.0, -22.0],
];

describe("sites", () => {
  it("returns the site summary seam and archives/restores", async () => {
    const site = await h.run((tx) => createSite(tx, h.ctx, { name: "Fazenda Boa Vista", type: "FARM", lat: -22, lng: -47 }));
    const summary = await h.run((tx) => getSummary(tx, site.id));
    expect(summary).toMatchObject({ id: site.id, name: "Fazenda Boa Vista", type: "FARM", lat: -22, lng: -47 });
    const archived = await h.run((tx) => updateSite(tx, h.ctx, site.id, { archived: true }));
    expect(archived.archivedAt).not.toBeNull();
    const restored = await h.run((tx) => updateSite(tx, h.ctx, site.id, { archived: false }, archived.syncVersion));
    expect(restored.archivedAt).toBeNull();
  });

  it("blocks deleting a referenced site with RECORD_IN_USE (EC-ERP-04)", async () => {
    const site = await h.run((tx) => createSite(tx, h.ctx, { name: "Pátio", type: "YARD" }));
    await h.run((tx) => createAsset(tx, h.ctx, { name: "Trator", category: "TRACTOR", homeSiteId: site.id }));
    await expect(h.run((tx) => deleteSite(tx, h.ctx, site.id))).rejects.toMatchObject({ code: "RECORD_IN_USE" });
    const free = await h.run((tx) => createSite(tx, h.ctx, { name: "Oficina", type: "WORKSHOP" }));
    await expect(h.run((tx) => deleteSite(tx, h.ctx, free.id))).resolves.toBeUndefined();
  });

  it("computes plot area/centroid and rejects invalid geometry (EC-ERP-02)", async () => {
    const metrics = ringMetrics(SQUARE);
    expect(metrics.areaHa).toBeGreaterThan(100);
    expect(metrics.areaHa).toBeLessThan(130);
    expect(validatePlotGeometry({ boundary: { coordinates: [SQUARE.slice(0, 3)] } })).toEqual({ ok: false, problem: "ring" });
    expect(validatePlotGeometry({ areaHa: -1 })).toEqual({ ok: false, problem: "area" });
    expect(validatePlotGeometry({ centroidLat: -22 })).toEqual({ ok: false, problem: "centroid" });

    const site = await h.run((tx) => createSite(tx, h.ctx, { name: "Fazenda", type: "FARM" }));
    const plot = await h.run((tx) => createPlot(tx, h.ctx, site.id, { name: "Talhão 1", boundary: { type: "Polygon", coordinates: [SQUARE] } }));
    expect(plot.areaHa).toBeGreaterThan(100);
    expect(plot.centroidLat).toBeCloseTo(-21.995, 3);
    await expect(
      h.run((tx) => createPlot(tx, h.ctx, site.id, { name: "Ruim", boundary: { type: "Polygon", coordinates: [[[200, 0], [0, 0], [0, 1], [200, 0]]] } })),
    ).rejects.toMatchObject({ code: "PLOT_GEOMETRY_INVALID" });
  });
});

describe("seasons", () => {
  const window = { name: "Plantio", startsOn: "2025-10-01", endsOn: "2025-11-30", assetCategories: ["PLANTER" as const] };

  it("keeps a single current season and finds the critical window", async () => {
    const a = await h.run((tx) => createSeason(tx, h.ctx, { name: "Soja 25/26", crop: "Soja", startsOn: "2025-09-01", endsOn: "2026-03-31", isCurrent: true, criticalWindows: [window] }));
    const b = await h.run((tx) => createSeason(tx, h.ctx, { name: "Milho 25/26", crop: "Milho", startsOn: "2025-09-01", endsOn: "2026-03-31", isCurrent: true }));
    expect(await h.run((tx) => currentSeasonId(tx, h.ctx.orgId))).toBe(b.id);
    expect(await h.raw("seasons").countDocuments({ isCurrent: true })).toBe(1);
    await h.run((tx) => updateSeason(tx, h.ctx, a.id, { isCurrent: true }));
    expect(await h.run((tx) => currentSeasonId(tx, h.ctx.orgId))).toBe(a.id);

    const hit = await h.run((tx) => criticalWindowFor(tx, h.ctx.orgId, "PLANTER", new Date("2025-10-15T12:00:00Z"), "America/Sao_Paulo"));
    expect(hit?.name).toBe("Plantio");
    expect(await h.run((tx) => criticalWindowFor(tx, h.ctx.orgId, "TRUCK", new Date("2025-10-15T12:00:00Z")))).toBeNull();
    expect(await h.run((tx) => criticalWindowFor(tx, h.ctx.orgId, "PLANTER", new Date("2025-12-15T12:00:00Z")))).toBeNull();
    expect(findCriticalWindow([{ ...window, assetCategories: [] }], "TRUCK", "2025-10-01")?.name).toBe("Plantio");
    // Organisation-local day: 2025-12-01T01:00Z is still 30 November in São Paulo.
    expect(await h.run((tx) => criticalWindowFor(tx, h.ctx.orgId, "PLANTER", new Date("2025-12-01T01:00:00Z"), "America/Sao_Paulo"))).not.toBeNull();
  });

  it("rejects same-crop overlap and null-crop overlap with SEASON_OVERLAP (EC-ERP-01)", async () => {
    await h.run((tx) => createSeason(tx, h.ctx, { name: "Soja", crop: "Soja", startsOn: "2025-09-01", endsOn: "2026-03-31" }));
    await expect(
      h.run((tx) => createSeason(tx, h.ctx, { name: "Soja 2", crop: "soja", startsOn: "2026-01-01", endsOn: "2026-06-30" })),
    ).rejects.toMatchObject({ code: "SEASON_OVERLAP" });
    await expect(
      h.run((tx) => createSeason(tx, h.ctx, { name: "Geral", crop: null, startsOn: "2026-01-01", endsOn: "2026-06-30" })),
    ).rejects.toMatchObject({ code: "SEASON_OVERLAP" });
    await expect(
      h.run((tx) => createSeason(tx, h.ctx, { name: "Milho", crop: "Milho", startsOn: "2026-01-01", endsOn: "2026-06-30" })),
    ).resolves.toMatchObject({ name: "Milho" });
  });

  it("warns before closing a season with open work (EC-ERP-05)", async () => {
    const season = await h.run((tx) => createSeason(tx, h.ctx, { name: "Soja", crop: "Soja", startsOn: "2025-09-01", endsOn: "2026-03-31", isCurrent: true }));
    await h.raw("rentals").insertOne(row({ seasonId: season.id, status: "ACTIVE" }));
    const warned = await h.run((tx) => closeSeason(tx, h.ctx, season.id, {}));
    expect(warned).toMatchObject({ closed: false, warning: "SEASON_OPEN_WORK_WARNING", openWork: { activeRentals: 1 } });
    const closed = await h.run((tx) => closeSeason(tx, h.ctx, season.id, { confirmOpenWork: true }));
    expect(closed.closed).toBe(true);
    expect(await h.run((tx) => currentSeasonId(tx, h.ctx.orgId))).toBeNull();
  });
});

describe("customers", () => {
  it("validates CPF/CNPJ, reports eligibility and masks the tax ID for field users", async () => {
    await expect(h.run((tx) => createCustomer(tx, h.ctx, { name: "X", taxId: "111.111.111-11" }))).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      fieldErrors: [{ path: "taxId", code: "taxId" }],
    });
    const created = await h.run((tx) => createCustomer(tx, h.ctx, { name: "João", taxId: "529.982.247-25" }));
    expect(created.taxId).toBe("52998224725");
    expect(await h.run((tx) => getForEligibility(tx, created.id))).toEqual({ id: created.id, hasDocument: true, hasPhone: false });
    await h.run((tx) => updateCustomer(tx, h.ctx, created.id, { whatsapp: "+55 11 99999-0000" }));
    expect(await h.run((tx) => getForEligibility(tx, created.id))).toMatchObject({ hasPhone: true });

    const field = await getCustomer({ orgId: h.ctx.orgId, role: "FIELD" }, created.id);
    expect(field.taxId).not.toBe("52998224725");
    expect(field.taxIdMasked).toContain("25");
    const search = await listCustomers({ orgId: h.ctx.orgId, role: "ADMIN" }, { q: "52998" });
    expect(search.items).toHaveLength(1);
    await expect(h.run((tx) => createCustomer(tx, h.ctx, { name: "Outro", taxId: "52998224725" }))).rejects.toMatchObject({
      fieldErrors: [{ path: "taxId", code: "duplicate" }],
    });
  });

  it("blocks deleting a customer referenced by a rental", async () => {
    const created = await h.run((tx) => createCustomer(tx, h.ctx, { name: "Maria" }));
    await h.raw("rentals").insertOne(row({ customerId: created.id, status: "CLOSED" }));
    await expect(h.run((tx) => deleteCustomer(tx, h.ctx, created.id))).rejects.toMatchObject({ code: "RECORD_IN_USE" });
  });
});

describe("checklist templates", () => {
  const item = (key: string) => ({ key, label: { "pt-BR": key, en: key }, type: "PASS_FAIL_NA" as const, required: true });

  it("publishes new versions, keeps snapshots immutable and picks the default template", async () => {
    const generic = await h.run((tx) => createTemplate(tx, h.ctx, { name: "Geral", appliesTo: ["RENTAL"], items: [item("oil")] }));
    const tractor = await h.run((tx) => createTemplate(tx, h.ctx, { name: "Trator", appliesTo: ["RENTAL"], assetCategories: ["TRACTOR"], items: [item("oil")] }));
    expect(tractor.templateVersion).toBe(1);
    expect(await h.run((tx) => defaultTemplateId(tx, h.ctx.orgId, "RENTAL", "TRACTOR"))).toBe(tractor.id);
    expect(await h.run((tx) => defaultTemplateId(tx, h.ctx.orgId, "RENTAL", "TRUCK"))).toBe(generic.id);
    expect(await h.run((tx) => defaultTemplateId(tx, h.ctx.orgId, "WORK_ORDER", "TRUCK"))).toBeNull();

    const snapshot = await h.run((tx) => snapshotPublished(tx, tractor.id));
    expect(Object.isFrozen(snapshot)).toBe(true);
    const published = await h.run((tx) => publishTemplate(tx, h.ctx, tractor.id, { items: [item("oil"), item("tires")] }));
    expect(published.templateVersion).toBe(2);
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.templateVersion).toBe(1);

    await h.run((tx) => updateTemplate(tx, h.ctx, tractor.id, { archived: true }));
    expect(await h.run((tx) => defaultTemplateId(tx, h.ctx.orgId, "RENTAL", "TRACTOR"))).toBe(generic.id);
  });

  it("requires confirmation to publish a template in use (EC-ERP-06) and blocks deleting it", async () => {
    const template = await h.run((tx) => createTemplate(tx, h.ctx, { name: "OS", appliesTo: ["WORK_ORDER"], items: [item("a")] }));
    await h.raw("work_orders").insertOne(row({ status: "OPEN", checklistTemplateId: template.id, checklistTemplateVersion: 1 }));
    await expect(h.run((tx) => publishTemplate(tx, h.ctx, template.id, { items: [item("b")] }))).rejects.toMatchObject({ code: "TEMPLATE_VERSION_IN_USE" });
    await h.run((tx) => publishTemplate(tx, h.ctx, template.id, { items: [item("b")], confirmInUse: true }));
    expect((await getTemplate(h.ctx, template.id)).templateVersion).toBe(2);
    await expect(h.run((tx) => deleteTemplate(tx, h.ctx, template.id))).rejects.toMatchObject({ code: "RECORD_IN_USE" });
    await expect(
      h.run((tx) => createTemplate(tx, h.ctx, { name: "Dup", appliesTo: ["RENTAL"], items: [item("a"), item("a")] })),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
});
