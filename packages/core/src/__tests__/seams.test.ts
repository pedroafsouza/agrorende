import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { CheckInInspection } from "@agrorende/contracts/mutations";

import { createNamedSeededDb, seedCtx, seedUuid, type SeededDb } from "../auth/testing/seeded.js";
import type { Ctx } from "../context.js";
import { newId } from "../modules/assets/kit.js";
import { markForRepair } from "../modules/fieldReports/service.js";
import { checkInInspection, mediaMeta } from "../modules/rentals/testing/harness.js";
import { createDamageWorkOrder } from "../modules/rentals/service.js";
import { assign, cancel } from "../modules/workOrders/service.js";
import { assetSeams, checklistSeams, fieldReportSeams, siteSeams, workOrderSeams } from "../seams.js";
import { push } from "../sync/push.js";
import { withSyncTx } from "../sync/withSyncTx.js";
import type { SyncTx } from "../sync/types.js";

/**
 * T10.2 — real seam wiring on the seeded replica set (no `vi.mock`). Mutations go through
 * `sync/push`; office actions go through the REST service functions inside `withSyncTx`.
 */

const DB = "agrorende_t10_seams";
const ORG_A = seedUuid(1);
const ORG_B_ASSET = seedUuid(439);
const DEVICE = "018fd000-0000-7000-8000-00000000d010";

const USERS = {
  admin: seedUuid(100),
  manager: seedUuid(101),
  dispatcher: seedUuid(102),
  joana: seedUuid(103),
  carlos: seedUuid(104),
  pedro: seedUuid(105),
  lucas: seedUuid(106),
  rafael: seedUuid(107),
  invitee: seedUuid(108),
  orgBAdmin: seedUuid(109),
} as const;

const manager = seedCtx(USERS.manager, "MANAGER");
const joana = seedCtx(USERS.joana, "FIELD");
const carlos = seedCtx(USERS.carlos, "FIELD");
const rafael = seedCtx(USERS.rafael, "FIELD");

let seeded: SeededDb;

beforeAll(async () => {
  seeded = await createNamedSeededDb(DB);
}, 60_000);

afterAll(async () => {
  await seeded.close();
});

function run<T>(ctx: Ctx, fn: (tx: SyncTx) => Promise<T>): Promise<T> {
  return withSyncTx(ctx, fn);
}

async function pushOne(ctx: Ctx, name: string, payload: unknown): Promise<void> {
  const response = await push(ctx, {
    deviceId: DEVICE,
    clientTime: new Date().toISOString(),
    deviceStatus: { appVersion: "1.0.0", runtimeVersion: "1", pendingMutations: 1, pendingUploads: 0, pendingBytes: 0, scopeEpoch: 0 },
    mutations: [{ id: newId(), name, payload, occurredAt: new Date().toISOString() }],
  });
  expect(response.results, `${name} → ${JSON.stringify(response.results)}`).toEqual([expect.objectContaining({ status: "APPLIED" })]);
}

async function row(collectionName: string, id: string): Promise<Record<string, unknown>> {
  const doc = await seeded.raw(collectionName).findOne({ _id: id });
  expect(doc, `${collectionName}/${id}`).not.toBeNull();
  return doc as Record<string, unknown>;
}

async function condition(assetId: string): Promise<unknown> {
  return (await row("assets", assetId)).condition;
}

/** Drives an assigned work order through the field flow and completes it as its assignee. */
async function workAndComplete(workOrderId: string, assignee: Ctx): Promise<void> {
  for (const action of ["accept", "startRoute", "arrive", "startWork"] as const) {
    await pushOne(assignee, "workOrder.transition", { id: workOrderId, action });
  }
  const wo = await row("work_orders", workOrderId);
  const snapshot = (wo.checklistSnapshot ?? []) as { key: string }[];
  await pushOne(assignee, "workOrder.saveChecklist", {
    id: workOrderId,
    templateVersion: wo.checklistTemplateVersion,
    responses: snapshot.map((item) => ({ key: item.key, value: "PASS", mediaIds: [], answeredAt: new Date().toISOString() })),
  });
  const now = new Date();
  await seeded.raw("media").insertOne({
    _id: newId(),
    organizationId: ORG_A,
    syncVersion: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    kind: "PHOTO",
    status: "UPLOADED",
    tag: "AFTER",
    mimeType: "image/jpeg",
    sizeBytes: 1000,
    capturedAt: now,
    capturedById: assignee.userId,
    parent: { type: "WORK_ORDER", id: workOrderId },
    damageId: null,
    checklistItemKey: null,
    isLateEvidence: false,
  });
  await pushOne(assignee, "workOrder.complete", {
    id: workOrderId,
    resolution: "Reparo concluído",
    signatureStatus: "ABSENT",
    signatureReason: "Cliente ausente no local",
    documentLocale: "pt-BR",
  });
}

describe("read seams against the demo seed", () => {
  it("assets.getSummary returns the seeded tractor #12", async () => {
    const summary = await run(manager, (tx) => assetSeams.getSummary(tx, seedUuid(411)));
    expect(summary).toEqual({
      id: seedUuid(411),
      code: "AGR-000012",
      name: "Trator JD 6110J #12",
      category: "TRACTOR",
      condition: "OPERATIONAL",
      ownerType: "ORGANIZATION",
      homeSiteId: seedUuid(203),
      currentSiteId: seedUuid(203),
      currentRentalId: null,
      lastLat: -21.111,
      lastLng: expect.closeTo(-47.711, 6),
      hourMeter: 4298,
      odometerKm: null,
      tankCapacityL: 300,
      isRentable: true,
      defaultRateCents: 85_000,
      defaultRateUnit: "DAY",
    });
  });

  it("assets.getSummary does not leak another organisation's asset", async () => {
    await expect(run(manager, (tx) => assetSeams.getSummary(tx, ORG_B_ASSET))).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("assets.listSummaries filters by organisation, category and ids", async () => {
    const all = await run(manager, (tx) => assetSeams.listSummaries(tx, ORG_A, {}));
    expect(all).toHaveLength(39);
    expect(all[0]?.code).toBe("AGR-000001");
    expect(all.map((asset) => asset.code)).not.toContain("AGR-BV-000001");

    const tractors = await run(manager, (tx) => assetSeams.listSummaries(tx, ORG_A, { category: "TRACTOR" }));
    expect(tractors).toHaveLength(14);
    expect(tractors.every((asset) => asset.category === "TRACTOR")).toBe(true);

    const byIds = await run(manager, (tx) => assetSeams.listSummaries(tx, ORG_A, { ids: [seedUuid(411), ORG_B_ASSET] }));
    expect(byIds.map((asset) => asset.id)).toEqual([seedUuid(411)]);

    await expect(run(manager, (tx) => assetSeams.listSummaries(tx, seedUuid(2), {}))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("sites.getSummary returns the seeded workshop", async () => {
    const site = await run(manager, (tx) => siteSeams.getSummary(tx, seedUuid(200)));
    expect(site).toEqual({ id: seedUuid(200), name: "Oficina Central Ribeirão Preto", type: "WORKSHOP", lat: -21.17, lng: -47.81, radiusM: 200 });
  });

  it("checklists.defaultTemplateId picks the seeded generic templates", async () => {
    // Both seeded rental templates are generic and equally recent; the tie breaks on the newest id.
    expect(await run(manager, (tx) => checklistSeams.defaultTemplateId(tx, ORG_A, "RENTAL", "TRACTOR"))).toBe(seedUuid(601));
    expect(await run(manager, (tx) => checklistSeams.defaultTemplateId(tx, ORG_A, "WORK_ORDER", "HARVESTER"))).toBe(seedUuid(602));
    expect(await run(seedCtx(USERS.orgBAdmin, "ADMIN", seedUuid(2)), (tx) => checklistSeams.defaultTemplateId(tx, seedUuid(2), "WORK_ORDER", "TRACTOR"))).toBeNull();
  });

  it("workOrders.openCountByAssignee counts the seeded active jobs per person", async () => {
    const counts = await run(manager, (tx) => workOrderSeams.openCountByAssignee(tx, ORG_A));
    // Seed WOs 2..11 are active (OPEN..ON_HOLD). WO 1 has no assignee, WO 11 (ON_HOLD) is Carlos's only open
    // job, and the others rotate over Pedro, Lucas, Rafael and Joana (§17, change request T13-002).
    expect(Object.fromEntries(counts)).toEqual({
      [USERS.carlos]: 1,
      [USERS.pedro]: 2,
      [USERS.lucas]: 3,
      [USERS.rafael]: 2,
      [USERS.joana]: 2,
    });
  });

  it("workOrders.maintenanceStatus reports open and last completed preventive jobs", async () => {
    const planId = newId();
    await seeded.raw("work_orders").updateMany({ _id: { $in: [seedUuid(1101), seedUuid(1112)] } }, { $set: { maintenancePlanId: planId } });
    try {
      const status = await run(manager, (tx) => workOrderSeams.maintenanceStatus(tx, planId, [seedUuid(401), seedUuid(412), seedUuid(420)]));
      expect(Object.fromEntries(status)).toEqual({
        [seedUuid(401)]: { hasOpen: true, lastCompleted: null },
        [seedUuid(412)]: { hasOpen: false, lastCompleted: { at: new Date("2026-10-07T12:00:00.000Z"), hourMeter: 4312 } },
        [seedUuid(420)]: { hasOpen: false, lastCompleted: null },
      });
      expect((await run(manager, (tx) => workOrderSeams.maintenanceStatus(tx, planId, []))).size).toBe(0);
    } finally {
      await seeded.raw("work_orders").updateMany({ _id: { $in: [seedUuid(1101), seedUuid(1112)] } }, { $set: { maintenancePlanId: null } });
    }
  });

  it("workOrders.billingSnapshot returns the billable facts of the seeded completed job", async () => {
    const snapshot = await run(manager, (tx) => workOrderSeams.billingSnapshot(tx, seedUuid(1111)));
    expect(snapshot).toEqual({
      id: seedUuid(1111),
      number: "WO-000012",
      status: "COMPLETED",
      customerId: seedUuid(301),
      workMinutes: null,
      laborCostCents: null,
      parts: [{ name: "Filtro hidráulico", quantity: 1, unit: "un", unitCostCents: 12_000 }],
      externalCostCents: null,
      externalCostNote: null,
    });
  });
});

describe("field report → mark for repair → work order", () => {
  const assetId = seedUuid(421);
  const reportId = newId();
  let workOrderId = "";

  it("creates the report through sync push and flags the asset", async () => {
    expect(await condition(assetId)).toBe("OPERATIONAL");
    await pushOne(joana, "fieldReport.create", {
      id: reportId,
      assetId,
      category: "HYDRAULIC",
      priority: "HIGH",
      machineOperable: false,
      suggestedAction: "REPAIR_NOW",
      title: "Vazamento no cilindro",
      description: "Mangueira estourada",
      lat: -21.15,
      lng: -47.75,
      media: [],
    });
    const report = await row("field_reports", reportId);
    expect(report).toMatchObject({ number: "FR-000021", status: "SUBMITTED", assetId, reporterId: USERS.joana, seasonId: seedUuid(700), workOrderId: null });
    expect(await condition(assetId)).toBe("NEEDS_REPAIR");
  });

  it("marks the report for repair and links both sides", async () => {
    const result = await run(manager, (tx) => markForRepair(tx, manager, reportId, {}));
    expect(result).toMatchObject({ workOrderNumber: "WO-000016", attached: false });
    workOrderId = result.workOrderId;

    const report = await row("field_reports", reportId);
    expect(report).toMatchObject({ status: "MARKED_FOR_REPAIR", workOrderId, reviewedById: USERS.manager });
    const wo = await row("work_orders", workOrderId);
    expect(wo).toMatchObject({
      number: "WO-000016",
      status: "OPEN",
      type: "CORRECTIVE",
      priority: "HIGH",
      fieldReportId: reportId,
      assetId,
      checklistTemplateId: seedUuid(602),
      checklistTemplateVersion: 1,
      createdById: USERS.manager,
      destLat: -21.15,
      destLng: -47.75,
    });
    expect(wo.checklistSnapshot).toHaveLength(10);
    // The report no longer blocks; the open work order keeps the asset in NEEDS_REPAIR.
    expect(await condition(assetId)).toBe("NEEDS_REPAIR");
  });

  it("moves the asset to IN_REPAIR while work runs and back to OPERATIONAL on completion", async () => {
    await run(manager, (tx) => assign(tx, manager, workOrderId, { assigneeId: USERS.carlos }));
    const before = await run(manager, (tx) => workOrderSeams.openCountByAssignee(tx, ORG_A));
    expect(before.get(USERS.carlos)).toBe(2);

    for (const action of ["accept", "startRoute", "arrive", "startWork"] as const) {
      await pushOne(carlos, "workOrder.transition", { id: workOrderId, action });
    }
    expect(await condition(assetId)).toBe("IN_REPAIR");

    const wo = await row("work_orders", workOrderId);
    await pushOne(carlos, "workOrder.saveChecklist", {
      id: workOrderId,
      templateVersion: wo.checklistTemplateVersion,
      responses: ((wo.checklistSnapshot ?? []) as { key: string }[]).map((item) => ({ key: item.key, value: "PASS", mediaIds: [], answeredAt: new Date().toISOString() })),
    });
    await pushOne(carlos, "workOrder.addPart", { id: newId(), workOrderId, name: "Mangueira hidráulica", quantity: 2, unit: "un", unitCostCents: 4_500 });
    const now = new Date();
    await seeded.raw("media").insertOne({
      _id: newId(),
      organizationId: ORG_A,
      syncVersion: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      kind: "PHOTO",
      status: "UPLOADED",
      tag: "AFTER",
      mimeType: "image/jpeg",
      sizeBytes: 1000,
      capturedAt: now,
      capturedById: USERS.carlos,
      parent: { type: "WORK_ORDER", id: workOrderId },
      damageId: null,
      checklistItemKey: null,
      isLateEvidence: false,
    });
    await pushOne(carlos, "workOrder.complete", {
      id: workOrderId,
      resolution: "Mangueira substituída",
      signatureStatus: "ABSENT",
      signatureReason: "Cliente ausente no local",
      documentLocale: "pt-BR",
    });
    expect(await condition(assetId)).toBe("OPERATIONAL");

    const after = await run(manager, (tx) => workOrderSeams.openCountByAssignee(tx, ORG_A));
    expect(after.get(USERS.carlos)).toBe(1);

    const snapshot = await run(manager, (tx) => workOrderSeams.billingSnapshot(tx, workOrderId));
    expect(snapshot).toMatchObject({
      id: workOrderId,
      number: "WO-000016",
      status: "COMPLETED",
      parts: [{ name: "Mangueira hidráulica", quantity: 2, unit: "un", unitCostCents: 4_500 }],
      externalCostCents: null,
    });
    expect(snapshot.workMinutes).toEqual(expect.any(Number));
    expect(snapshot.laborCostCents).toBe(Math.round(((snapshot.workMinutes ?? 0) / 60) * 8_500));
  });
});

describe("rental check-in damage → field report → work order → repaired", () => {
  const rentalId = seedUuid(1204);
  const assetId = seedUuid(404);
  const damageId = newId();
  let reportId = "";
  let workOrderId = "";

  it("check-in with a new damage creates the field report through the seam", async () => {
    // The seeded ACCEPTED job on this asset would otherwise keep it in NEEDS_REPAIR for the whole flow.
    await run(manager, (tx) => cancel(tx, manager, seedUuid(1104), { reason: "Duplicada" }));
    expect(await condition(assetId)).toBe("OPERATIONAL");

    const base = checkInInspection(assetId, { templateId: seedUuid(600), hourMeter: 4_310 });
    const photo = mediaMeta(base.id, "PHOTO", "DAMAGE", { damageId });
    const inspection: CheckInInspection = {
      ...base,
      media: [...base.media, photo],
      damages: [{ id: damageId, zone: "FRONT", severity: "SEVERE", description: "Farol quebrado", isPreExisting: false, matchStatus: "NEW", mediaIds: [photo.id] }],
    };
    await pushOne(rafael, "rental.checkin", { rentalId, inspection, damageCosts: [{ damageId, estimatedCostCents: 120_000 }] });

    expect(await row("rentals", rentalId)).toMatchObject({ status: "RETURNED", checkInInspectionId: base.id });
    const damage = await row("damages", damageId);
    expect(damage).toMatchObject({ assetId, detectedRentalId: rentalId, severity: "SEVERE", isPreExisting: false, repairedAt: null });
    expect(damage.fieldReportId).toEqual(expect.any(String));
    reportId = String(damage.fieldReportId);

    const report = await row("field_reports", reportId);
    expect(report).toMatchObject({
      number: "FR-000022",
      damageId,
      rentalId,
      assetId,
      status: "SUBMITTED",
      priority: "HIGH",
      machineOperable: false,
      suggestedAction: "REPAIR_NOW",
      title: "RN-000005 · FRONT",
      flags: { fromDamage: true },
    });
    expect(await condition(assetId)).toBe("NEEDS_REPAIR");
    expect((await row("assets", assetId)).currentRentalId).toBeNull();

    const again = await run(rafael, (tx) => fieldReportSeams.createFromDamage(tx, rafael, { damageId, rentalId, assetId }));
    expect(again).toEqual({ id: reportId, number: "FR-000022" });
  });

  it("damage → work order, report attached, completion marks the damage repaired", async () => {
    const created = await run(manager, (tx) => createDamageWorkOrder(tx, manager, damageId, { priority: "HIGH", assigneeId: USERS.carlos }));
    workOrderId = created.id;
    expect(created.number).toBe("WO-000017");
    expect(await row("work_orders", workOrderId)).toMatchObject({ status: "ASSIGNED", rentalId, damageIds: [damageId], assetId, customerId: seedUuid(304), assigneeId: USERS.carlos });

    const attached = await run(manager, (tx) => markForRepair(tx, manager, reportId, { existing: "attach" }));
    expect(attached).toEqual({ workOrderId, workOrderNumber: "WO-000017", attached: true });
    expect(await row("field_reports", reportId)).toMatchObject({ status: "MARKED_FOR_REPAIR", workOrderId });

    await workAndComplete(workOrderId, carlos);

    expect(await row("work_orders", workOrderId)).toMatchObject({ status: "COMPLETED" });
    expect(await row("damages", damageId)).toMatchObject({ repairedWorkOrderId: workOrderId, repairedAt: expect.any(Date) });
    const repaired = await seeded.raw("activity_events").countDocuments({ entityType: "DAMAGE", entityId: damageId, action: "damage.repaired" });
    expect(repaired).toBe(1);
    expect(await condition(assetId)).toBe("OPERATIONAL");
  });
});
