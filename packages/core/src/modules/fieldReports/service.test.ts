import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@agrorende/contracts/errors";
import type { FieldReportCreatePayload } from "@agrorende/contracts/mutations";
import type { MediaMeta } from "@agrorende/contracts/sync";
import type * as Seams from "../../seams";
import type { MutationMeta } from "../../sync/types";
import { makeTestCtx } from "../../testing/ctx";
import { createAsset } from "../assets/service";
import { newId } from "../assets/kit";
import { mutations } from "./mutations";
import { countOpenReports, getFieldReportDetail, listFieldReports } from "./queries";
import { createFromDamage, createReport, dismiss, linkAsset, markForRepair, monitor, startReview, updateReport, withdraw } from "./service";
import { ADMIN_ID, createHarness, MANAGER_ID, OPERATOR_ID, OTHER_OPERATOR_ID, type Harness, userRow } from "./testing/harness";

const seamMocks = vi.hoisted(() => ({
  createFromSource: vi.fn(),
  activeRentalForAsset: vi.fn(),
}));

vi.mock("../../seams", async (importOriginal) => {
  const original = await importOriginal<typeof Seams>();
  return {
    ...original,
    workOrderSeams: { ...original.workOrderSeams, createFromSource: seamMocks.createFromSource },
    rentalSeams: { ...original.rentalSeams, activeRentalForAsset: seamMocks.activeRentalForAsset },
  };
});

let h: Harness;
const operator = makeTestCtx({ userId: OPERATOR_ID, role: "FIELD" });
const otherOperator = makeTestCtx({ userId: OTHER_OPERATOR_ID, role: "FIELD" });
const manager = makeTestCtx({ userId: MANAGER_ID, role: "MANAGER" });

beforeAll(async () => {
  h = await createHarness("reports");
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  for (const name of ["assets", "work_orders", "field_reports", "damages", "rentals", "activity_events", "media", "notifications", "event_outbox", "users", "number_sequences"]) {
    await h.raw(name).deleteMany({});
  }
  await h.raw("users").insertMany([
    userRow(ADMIN_ID, "ADMIN", "Ana Admin"),
    userRow(MANAGER_ID, "MANAGER", "Marcos Gerente"),
    userRow(OPERATOR_ID, "FIELD", "Osvaldo Operador"),
    userRow(OTHER_OPERATOR_ID, "FIELD", "Olga Operadora"),
  ]);
  seamMocks.createFromSource.mockReset();
  seamMocks.activeRentalForAsset.mockReset();
  seamMocks.activeRentalForAsset.mockRejectedValue(new AppError("INTERNAL", { message: "NOT_IMPLEMENTED" }));
  let counter = 0;
  seamMocks.createFromSource.mockImplementation(async () => {
    counter += 1;
    return { id: newId(), number: `WO-${String(counter).padStart(6, "0")}` };
  });
});

async function seedAsset(name = "Trator 1"): Promise<string> {
  const dto = await h.run((tx) => createAsset(tx, h.ctx, { name, category: "TRACTOR" }));
  return dto.id;
}

function mediaMeta(kind: "PHOTO" | "VIDEO", reportId: string): MediaMeta {
  return {
    id: newId(),
    kind,
    tag: "GENERAL",
    mimeType: kind === "PHOTO" ? "image/jpeg" : "video/mp4",
    sizeBytes: 1000,
    capturedAt: new Date().toISOString(),
    parent: { type: "FIELD_REPORT", id: reportId },
  };
}

function payload(extra: Partial<FieldReportCreatePayload> = {}): FieldReportCreatePayload & { media: MediaMeta[] } {
  const id = newId();
  return {
    id,
    category: "ENGINE" as const,
    priority: "MEDIUM" as const,
    machineOperable: true,
    suggestedAction: "REPAIR_SOON" as const,
    title: "Vazamento de óleo",
    ...extra,
    media: [...(extra.media ?? [])],
  };
}

async function seedWorkOrder(assetId: string, status = "ASSIGNED"): Promise<string> {
  const id = newId();
  const now = new Date();
  await h.raw("work_orders").insertOne({
    _id: id,
    organizationId: h.ctx.orgId,
    syncVersion: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    number: "WO-000777",
    type: "CORRECTIVE",
    status,
    priority: "HIGH",
    title: "Troca de mangueira",
    assetId,
    assigneeId: OTHER_OPERATOR_ID,
    damageIds: [],
    previousAssigneeIds: [],
    checklistResponses: [],
  });
  return id;
}

describe("fieldReport.create", () => {
  it("stores an offline report with six photos and one video as one report with seven pending media", async () => {
    const assetId = await seedAsset();
    const base = payload({ assetId, lat: -12.5, lng: -55.7 });
    const media = [...Array.from({ length: 6 }, () => mediaMeta("PHOTO", base.id)), mediaMeta("VIDEO", base.id)];
    const meta: MutationMeta = { mutationId: newId(), deviceId: newId(), occurredAt: new Date("2026-10-07T10:00:00Z"), receivedAt: new Date(), clockSkewed: false };
    const outcome = await h.run((tx) => mutations["fieldReport.create"].apply(tx, operator, { ...base, media }, meta));
    expect(outcome.assigned?.number).toBe("FR-000001");
    const reports = await h.raw("field_reports").find({}).toArray();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ status: "SUBMITTED", reporterId: OPERATOR_ID, assetId, lat: -12.5 });
    expect((reports[0]?.occurredAt as Date).toISOString()).toBe("2026-10-07T10:00:00.000Z");
    const rows = await h.raw("media").find({ "parent.id": base.id }).toArray();
    expect(rows).toHaveLength(7);
    expect(rows.every((row) => row.status === "PENDING")).toBe(true);
    const activity = await h.raw("activity_events").find({ entityId: base.id, action: "fieldReport.created" }).toArray();
    expect(activity).toHaveLength(1);
    expect(activity[0]?.mutationId).toBe(meta.mutationId);
  });

  it("is idempotent by id", async () => {
    const assetId = await seedAsset();
    const base = payload({ assetId });
    const first = await h.run((tx) => createReport(tx, operator, base));
    const second = await h.run((tx) => createReport(tx, operator, base));
    expect(first.created).toBe(true);
    expect(second).toEqual({ id: base.id, number: first.number, created: false });
    expect(await h.raw("field_reports").countDocuments({})).toBe(1);
  });

  it("notifies the office for critical or not-operable reports and flags the asset as needing repair", async () => {
    const assetId = await seedAsset();
    await h.run((tx) => createReport(tx, operator, payload({ assetId, priority: "CRITICAL", machineOperable: false })));
    const notifications = await h.raw("notifications").find({ type: "REPORT_CRITICAL" }).toArray();
    expect(notifications.map((row) => row.userId).sort()).toEqual([ADMIN_ID, MANAGER_ID].sort());
    const asset = await h.raw("assets").findOne({ _id: assetId });
    expect(asset?.condition).toBe("NEEDS_REPAIR");
  });

  it("does not notify for routine reports", async () => {
    const assetId = await seedAsset();
    await h.run((tx) => createReport(tx, operator, payload({ assetId })));
    expect(await h.raw("notifications").countDocuments({})).toBe(0);
  });

  it("keeps a report for an unknown asset as unregistered (EC-FR-04)", async () => {
    const ghost = newId();
    const base = payload({ assetId: ghost });
    await h.run((tx) => createReport(tx, operator, base));
    const doc = await h.raw("field_reports").findOne({ _id: base.id });
    expect(doc?.assetId).toBeNull();
    expect(doc?.flags).toMatchObject({ unknownAssetId: ghost });
  });

  it("flags retired, rented-out and busy assets, and links the open work order (EC-FR-05, EC-FR-06)", async () => {
    const assetId = await seedAsset();
    const rentalId = newId();
    await h.raw("assets").updateOne({ _id: assetId }, { $set: { condition: "RETIRED", currentRentalId: rentalId } });
    const woId = await seedWorkOrder(assetId);
    const base = payload({ assetId, priority: "CRITICAL" });
    await h.run((tx) => createReport(tx, operator, base));
    const doc = await h.raw("field_reports").findOne({ _id: base.id });
    expect(doc?.rentalId).toBe(rentalId);
    expect(doc?.flags).toMatchObject({ assetRetired: true, assetRentedOut: true, openWorkOrderId: woId, busyAsset: true });
    expect(await h.raw("activity_events").countDocuments({ entityId: woId, action: "workOrder.reportAttached" })).toBe(1);
  });

  it("uses the rental seam when it is wired", async () => {
    const assetId = await seedAsset();
    const rentalId = newId();
    seamMocks.activeRentalForAsset.mockResolvedValue({ id: rentalId, number: "RT-000001" });
    const base = payload({ assetId });
    await h.run((tx) => createReport(tx, operator, base));
    expect((await h.raw("field_reports").findOne({ _id: base.id }))?.rentalId).toBe(rentalId);
  });

  it("stores the unregistered description and marks skewed clocks", async () => {
    const base = payload({ unregisteredAssetDesc: "Carreta azul sem placa" });
    await h.run((tx) => createReport(tx, operator, base, { clockSkewed: true }));
    const doc = await h.raw("field_reports").findOne({ _id: base.id });
    expect(doc).toMatchObject({ assetId: null, unregisteredAssetDesc: "Carreta azul sem placa" });
    expect(doc?.flags).toMatchObject({ clockSkewed: true });
  });
});

describe("office triage", () => {
  it("starts review, monitors with a note and dismisses with a reason", async () => {
    const assetId = await seedAsset();
    const base = payload({ assetId });
    await h.run((tx) => createReport(tx, operator, base));
    const reviewed = await h.run((tx) => startReview(tx, h.ctx, base.id));
    expect(reviewed.status).toBe("IN_REVIEW");
    await expect(h.run((tx) => monitor(tx, h.ctx, base.id, { note: "" }))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    const monitored = await h.run((tx) => monitor(tx, h.ctx, base.id, { note: "Acompanhar na próxima semana" }));
    expect(monitored.status).toBe("MONITORING");
    expect(monitored.statusReason).toBe("Acompanhar na próxima semana");
    const dismissed = await h.run((tx) => dismiss(tx, manager, base.id, { reason: "Resolvido no campo" }));
    expect(dismissed.status).toBe("DISMISSED");
    const actions = (await h.raw("activity_events").find({ entityId: base.id }).sort({ occurredAt: 1 }).toArray()).map((row) => row.action);
    expect(actions).toEqual(["fieldReport.created", "fieldReport.reviewStarted", "fieldReport.monitoring", "fieldReport.dismissed"]);
  });

  it("rejects office actions from field roles", async () => {
    const base = payload({ unregisteredAssetDesc: "Bomba" });
    await h.run((tx) => createReport(tx, operator, base));
    await expect(h.run((tx) => startReview(tx, operator, base.id))).rejects.toMatchObject({ code: "OFFICE_ROLE_REQUIRED" });
  });

  it("marks for repair through the work-order seam and notifies the reporter", async () => {
    const assetId = await seedAsset();
    const base = payload({ assetId, lat: -12, lng: -55 });
    await h.run((tx) => createReport(tx, operator, base));
    const result = await h.run((tx) => markForRepair(tx, h.ctx, base.id, { priority: "HIGH", assigneeId: OTHER_OPERATOR_ID }));
    expect(result.attached).toBe(false);
    expect(seamMocks.createFromSource).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ source: "FIELD_REPORT", fieldReportId: base.id, priority: "HIGH", assetId, assigneeId: OTHER_OPERATOR_ID, destination: { lat: -12, lng: -55 } }),
    );
    const doc = await h.raw("field_reports").findOne({ _id: base.id });
    expect(doc).toMatchObject({ status: "MARKED_FOR_REPAIR", workOrderId: result.workOrderId });
    const notes = await h.raw("notifications").find({ type: "REPORT_MARKED_FOR_REPAIR" }).toArray();
    expect(notes.map((row) => row.userId)).toEqual([OPERATOR_ID]);
    expect(await h.raw("event_outbox").countDocuments({ type: "sync:poke" })).toBeGreaterThan(0);
  });

  it("locks reports after mark-for-repair or dismissal (EC-FR-18)", async () => {
    const base = payload({ unregisteredAssetDesc: "Bomba" });
    await h.run((tx) => createReport(tx, operator, base));
    await h.run((tx) => markForRepair(tx, h.ctx, base.id));
    await expect(h.run((tx) => markForRepair(tx, h.ctx, base.id))).rejects.toMatchObject({ code: "REPORT_LOCKED" });
    await expect(h.run((tx) => dismiss(tx, h.ctx, base.id, { reason: "x" }))).rejects.toMatchObject({ code: "REPORT_LOCKED" });
    await expect(h.run((tx) => updateReport(tx, operator, { id: base.id, patch: { title: "Novo" } }))).rejects.toMatchObject({ code: "REPORT_LOCKED" });
    await expect(h.run((tx) => withdraw(tx, operator, { id: base.id, reason: "engano" }))).rejects.toMatchObject({ code: "REPORT_LOCKED" });
  });

  it("returns the open work order when the asset already has a repair job (EC-FR-15)", async () => {
    const assetId = await seedAsset();
    const woId = await seedWorkOrder(assetId, "IN_PROGRESS");
    const base = payload({ assetId });
    await h.run((tx) => createReport(tx, operator, base));
    await expect(h.run((tx) => markForRepair(tx, h.ctx, base.id))).rejects.toMatchObject({
      code: "ASSET_REPAIR_ALREADY_OPEN",
      details: { workOrder: { id: woId, number: "WO-000777", status: "IN_PROGRESS", assigneeName: "Olga Operadora" } },
    });
    await expect(h.run((tx) => markForRepair(tx, h.ctx, base.id, { existing: "createAnyway" }))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    const attached = await h.run((tx) => markForRepair(tx, h.ctx, base.id, { existing: "attach" }));
    expect(attached).toEqual({ workOrderId: woId, workOrderNumber: "WO-000777", attached: true });
    expect(seamMocks.createFromSource).not.toHaveBeenCalled();
  });

  it("creates a second job when the office insists with a reason", async () => {
    const assetId = await seedAsset();
    await seedWorkOrder(assetId);
    const base = payload({ assetId });
    await h.run((tx) => createReport(tx, operator, base));
    const result = await h.run((tx) => markForRepair(tx, h.ctx, base.id, { existing: "createAnyway", reason: "Outro sistema" }));
    expect(result.attached).toBe(false);
    expect((await h.raw("field_reports").findOne({ _id: base.id }))?.flags).toMatchObject({ createAnywayReason: "Outro sistema" });
  });

  it("dismisses as a duplicate of another report (EC-FR-17)", async () => {
    const first = payload({ unregisteredAssetDesc: "Bomba" });
    const second = payload({ unregisteredAssetDesc: "Bomba" });
    await h.run((tx) => createReport(tx, operator, first));
    await h.run((tx) => createReport(tx, otherOperator, second));
    await h.run((tx) => dismiss(tx, h.ctx, second.id, { reason: "Duplicado", duplicateOf: { entityType: "FIELD_REPORT", entityId: first.id } }));
    expect((await h.raw("field_reports").findOne({ _id: second.id }))?.flags).toMatchObject({ duplicateOf: { entityType: "FIELD_REPORT", entityId: first.id } });
    expect(await h.raw("activity_events").countDocuments({ entityId: first.id, action: "fieldReport.duplicateMerged" })).toBe(1);
  });
});

describe("reporter actions", () => {
  it("lets only the reporter withdraw a submitted report", async () => {
    const base = payload({ unregisteredAssetDesc: "Bomba" });
    await h.run((tx) => createReport(tx, operator, base));
    await expect(h.run((tx) => withdraw(tx, otherOperator, { id: base.id, reason: "x" }))).rejects.toMatchObject({ code: "FORBIDDEN" });
    const dto = await h.run((tx) => mutations["fieldReport.withdraw"].apply(tx, operator, { id: base.id, reason: "Enviei errado" }, {} as MutationMeta));
    expect(dto).toEqual({});
    const doc = await h.raw("field_reports").findOne({ _id: base.id });
    expect(doc).toMatchObject({ status: "DISMISSED", statusReason: "WITHDRAWN: Enviei errado" });
    await expect(h.run((tx) => withdraw(tx, operator, { id: base.id, reason: "Enviei errado" }))).resolves.toMatchObject({ status: "DISMISSED" });
  });

  it("updates a submitted report and notifies when it becomes critical", async () => {
    const base = payload({ unregisteredAssetDesc: "Bomba" });
    await h.run((tx) => createReport(tx, operator, base));
    const updated = await h.run((tx) => updateReport(tx, operator, { id: base.id, patch: { priority: "CRITICAL" } }));
    expect(updated.priority).toBe("CRITICAL");
    expect(await h.raw("notifications").countDocuments({ type: "REPORT_CRITICAL" })).toBe(2);
  });
});

describe("link-asset (FR-22)", () => {
  it("links an unregistered machine to an asset once and keeps the description in the activity", async () => {
    const base = payload({ unregisteredAssetDesc: "Carreta azul sem placa" });
    await h.run((tx) => createReport(tx, operator, base));
    const assetId = await seedAsset("Carreta 4");
    await expect(h.run((tx) => linkAsset(tx, operator, base.id, { assetId }))).rejects.toMatchObject({ code: "OFFICE_ROLE_REQUIRED" });
    await expect(h.run((tx) => linkAsset(tx, manager, base.id, { assetId: newId() }))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    const linked = await h.run((tx) => linkAsset(tx, manager, base.id, { assetId }));
    expect(linked).toMatchObject({ assetId, unregisteredAssetDesc: null });
    await expect(h.run((tx) => linkAsset(tx, manager, base.id, { assetId }))).resolves.toMatchObject({ assetId });
    const other = await seedAsset("Carreta 5");
    await expect(h.run((tx) => linkAsset(tx, manager, base.id, { assetId: other }))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    const event = await h.raw("activity_events").findOne({ entityId: base.id, action: "fieldReport.assetLinked" });
    expect(event?.meta).toMatchObject({ assetId, unregisteredAssetDesc: "Carreta azul sem placa" });
    expect(await h.raw("activity_events").countDocuments({ entityId: assetId, action: "fieldReport.assetLinked" })).toBe(1);
  });
});

describe("createFromDamage seam", () => {
  it("creates one linked report per damage", async () => {
    const assetId = await seedAsset();
    const rentalId = newId();
    const damageId = newId();
    const now = new Date();
    await h.raw("rentals").insertOne({ _id: rentalId, organizationId: h.ctx.orgId, syncVersion: 1, createdAt: now, updatedAt: now, deletedAt: null, number: "RT-000042", status: "RETURNED" });
    await h.raw("damages").insertOne({ _id: damageId, organizationId: h.ctx.orgId, syncVersion: 1, createdAt: now, updatedAt: now, deletedAt: null, assetId, zone: "Para-lama dianteiro", severity: "SEVERE", description: "Amassado", reportedById: OPERATOR_ID, repairedAt: null });
    const first = await h.run((tx) => createFromDamage(tx, h.ctx, { damageId, rentalId, assetId }));
    const again = await h.run((tx) => createFromDamage(tx, h.ctx, { damageId, rentalId, assetId }));
    expect(again).toEqual(first);
    const doc = await h.raw("field_reports").findOne({ _id: first.id });
    expect(doc).toMatchObject({ rentalId, damageId, priority: "HIGH", machineOperable: false, suggestedAction: "REPAIR_NOW", title: "RT-000042 · Para-lama dianteiro", reporterId: OPERATOR_ID });
  });
});

describe("queries", () => {
  it("lists with filters and enriches rows; detail carries media, asset and activity", async () => {
    const assetId = await seedAsset("Colheitadeira");
    const critical = payload({ assetId, priority: "CRITICAL", title: "Freio falhando" });
    critical.media = [mediaMeta("PHOTO", critical.id)];
    await h.run((tx) => createReport(tx, operator, critical));
    await h.run((tx) => createReport(tx, operator, payload({ unregisteredAssetDesc: "Bomba", priority: "LOW" })));
    const all = await listFieldReports(h.ctx, {});
    expect(all.items).toHaveLength(2);
    const filtered = await listFieldReports(h.ctx, { priority: "CRITICAL,HIGH", status: "SUBMITTED" });
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0]).toMatchObject({ assetName: "Colheitadeira", reporterName: "Osvaldo Operador", mediaCount: 1 });
    expect((await listFieldReports(h.ctx, { q: "colheit" })).items).toHaveLength(1);
    expect((await listFieldReports(h.ctx, { q: "freio" })).items).toHaveLength(1);
    expect(await countOpenReports(h.ctx)).toBe(2);
    const detail = await getFieldReportDetail(h.ctx, critical.id);
    expect(detail.media).toHaveLength(1);
    expect(detail.asset?.name).toBe("Colheitadeira");
    expect(detail.reporter?.name).toBe("Osvaldo Operador");
    expect(detail.activity.map((row) => row.action)).toContain("fieldReport.created");
    await expect(getFieldReportDetail(h.ctx, newId())).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
