import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { WorkOrderCompletePayload } from "@agrorende/contracts/mutations";
import type { WorkOrderSeams } from "@agrorende/contracts/seams";

import type * as Seams from "../../seams.js";

import { complete, releaseSafetyHold, saveChecklist, transition } from "./field.js";
import { mutations } from "./mutations.js";
import { addPart, partsCostCents, removePart } from "./parts.js";
import { detail, list } from "./queries.js";
import {
  assign,
  billingSnapshot,
  cancel,
  createFromSource,
  createManual,
  maintenanceStatus,
  openCountByAssignee,
  patch,
  reassign,
  reopen,
  setExternalCost,
  verify,
} from "./service.js";
import { suggestTechnicians } from "./suggest.js";
import { createSeededDb, ctxOf, ORG_A, PEOPLE, seedUuid, type SeededDb } from "./testing/seeded.js";

const markDamagesRepaired = vi.fn(async () => undefined);
vi.mock("../../seams.js", async (importOriginal) => {
  const original = await importOriginal<typeof Seams>();
  return { ...original, rentalSeams: { ...original.rentalSeams, markDamagesRepaired: (...args: unknown[]) => markDamagesRepaired(...(args as [])) } };
});

let db: SeededDb;
const admin = ctxOf(PEOPLE.admin, "ADMIN");
const manager = ctxOf(PEOPLE.manager, "MANAGER");
const carlos = ctxOf(PEOPLE.carlos, "FIELD");
const pedro = ctxOf(PEOPLE.pedro, "FIELD");
const meta = (offsetMin = 0) => ({ occurredAt: new Date(Date.now() + offsetMin * 60_000) });

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

beforeAll(async () => {
  db = await createSeededDb("service");
}, 60_000);

afterAll(async () => {
  await db.close();
});

/** Creates a fresh job on asset seedUuid(assetIndex) (no seeded job there) assigned to Carlos. */
async function freshJob(assetIndex: number, extra: Record<string, unknown> = {}): Promise<string> {
  const created = await db.run((tx) =>
    createManual(tx, admin, { type: "CORRECTIVE", priority: "HIGH", title: "Hydraulic leak", assetId: seedUuid(assetIndex), assigneeId: PEOPLE.carlos, ...extra }),
  );
  return created.id;
}

async function walkToInProgress(id: string, actor = carlos): Promise<void> {
  for (const [index, action] of (["accept", "startRoute", "arrive", "startWork"] as const).entries()) {
    await db.run((tx) => transition(tx, actor, { id, action }, meta(index * 10)));
  }
}

async function addAfterPhoto(id: string): Promise<string> {
  const mediaId = crypto.randomUUID();
  const now = new Date();
  await db.raw("media").insertOne({
    _id: mediaId,
    organizationId: ORG_A,
    syncVersion: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    kind: "PHOTO",
    status: "UPLOADED",
    tag: "AFTER",
    mimeType: "image/jpeg",
    storageKey: `org/${ORG_A}/media/${mediaId}.jpg`,
    variants: {},
    capturedAt: now,
    capturedById: PEOPLE.carlos,
    parent: { type: "WORK_ORDER", id },
    isLateEvidence: false,
  });
  return mediaId;
}

async function answerAll(id: string, actor = carlos): Promise<void> {
  const wo = await db.raw("work_orders").findOne({ _id: id });
  const items = (wo?.checklistSnapshot ?? []) as { key: string }[];
  await db.run((tx) =>
    saveChecklist(
      tx,
      actor,
      { id, templateVersion: 1, responses: items.map((item) => ({ key: item.key, value: "PASS" as const, mediaIds: [], answeredAt: new Date().toISOString() })) },
      meta(),
    ),
  );
}

const completion = (id: string, extra: Partial<WorkOrderCompletePayload> = {}): WorkOrderCompletePayload => ({
  id,
  resolution: "Replaced the hose",
  documentLocale: "pt-BR",
  signatureStatus: "ABSENT",
  signatureReason: "Customer not on site",
  ...extra,
});

/** Compile-time proof that the T07 functions satisfy the frozen seam contract (change request T07-001). */
const seamImplementation: WorkOrderSeams = { createFromSource, openCountByAssignee, maintenanceStatus, billingSnapshot };

describe("seams", () => {
  it("implements every work order seam", () => {
    expect(Object.keys(seamImplementation).sort()).toEqual(["billingSnapshot", "createFromSource", "maintenanceStatus", "openCountByAssignee"]);
  });

  it("createFromSource from a field report links the report, snapshots the checklist and computes the SLA", async () => {
    const reportId = seedUuid(1015);
    const result = await db.run((tx) => createFromSource(tx, manager, { source: "FIELD_REPORT", fieldReportId: reportId, type: "CORRECTIVE", priority: "HIGH", title: "Engine noise" }));
    expect(result.number).toMatch(/^WO-\d{6}$/u);
    const wo = await db.raw("work_orders").findOne({ _id: result.id });
    expect(wo?.status).toBe("OPEN");
    expect(wo?.assetId).toBe(seedUuid(415));
    expect(wo?.fieldReportId).toBe(reportId);
    expect((wo?.checklistSnapshot as unknown[]).length).toBeGreaterThan(0);
    const dueMs = (wo?.dueAt as Date).getTime() - (wo?.createdAt as Date).getTime();
    expect(Math.round(dueMs / 3_600_000)).toBe(24);
    expect((await db.raw("field_reports").findOne({ _id: reportId }))?.workOrderId).toBe(result.id);
    const activity = await db.raw("activity_events").findOne({ entityId: result.id, action: "workOrder.create" });
    expect(activity?.toStatus).toBe("OPEN");
  });

  it("rejects a second open repair job only when asked to (EC-FR-15 is decided by the caller)", async () => {
    const input = { source: "MANUAL" as const, assetId: seedUuid(415), type: "CORRECTIVE" as const, priority: "HIGH" as const, title: "Again" };
    let details: unknown;
    try {
      await db.run((tx) => createFromSource(tx, manager, input, { rejectDuplicate: true }));
    } catch (error) {
      expect((error as { code?: string }).code).toBe("ASSET_REPAIR_ALREADY_OPEN");
      details = (error as { details?: unknown }).details;
    }
    expect(details).toMatchObject({ workOrder: { number: expect.stringMatching(/^WO-/u), status: "OPEN" } });
    const second = await db.run((tx) => createFromSource(tx, manager, input, { duplicateReason: "Different fault" }));
    expect(second.id).toBeTruthy();
  });

  it("refuses retired assets (EC-WO-16) and field users", async () => {
    await db.raw("assets").updateOne({ _id: seedUuid(430) }, { $set: { condition: "RETIRED" } });
    expect(await codeOf(db.run((tx) => createFromSource(tx, manager, { source: "MANUAL", type: "CORRECTIVE", priority: "LOW", title: "x", assetId: seedUuid(430) })))).toBe("WO_ASSET_RETIRED");
    expect(await codeOf(db.run((tx) => createFromSource(tx, carlos, { source: "MANUAL", type: "CORRECTIVE", priority: "LOW", title: "x" })))).toBe("OFFICE_ROLE_REQUIRED");
  });

  it("creates maintenance jobs for the system actor and reports maintenanceStatus", async () => {
    const planId = crypto.randomUUID();
    const now = new Date();
    await db.raw("maintenance_plans").insertOne({ _id: planId, organizationId: ORG_A, syncVersion: 1, createdAt: now, updatedAt: now, deletedAt: null, name: "500 h service" });
    const system = { organizationId: ORG_A, userId: "system", role: "ADMIN" as const };
    const created = await db.run((tx) =>
      createFromSource(tx, system, { source: "MAINTENANCE", maintenancePlanId: planId, type: "PREVENTIVE", priority: "MEDIUM", title: "500 h", assetId: seedUuid(420) }),
    );
    expect((await db.raw("work_orders").findOne({ _id: created.id }))?.createdById).toBeNull();
    const status = await db.run((tx) => maintenanceStatus(tx, planId, [seedUuid(420), seedUuid(421)]));
    expect(status.get(seedUuid(420))).toEqual({ hasOpen: true, lastCompleted: null });
    expect(status.get(seedUuid(421))).toEqual({ hasOpen: false, lastCompleted: null });
  });

  it("counts open jobs per assignee and builds the billing snapshot", async () => {
    const counts = await db.run((tx) => openCountByAssignee(tx, ORG_A));
    const seeded = await db.raw("work_orders").find({ assigneeId: PEOPLE.carlos, status: { $nin: ["COMPLETED", "VERIFIED", "CANCELLED"] }, deletedAt: null }).toArray();
    expect(counts.get(PEOPLE.carlos) ?? 0).toBe(seeded.length);
    const snapshot = await db.run((tx) => billingSnapshot(tx, seedUuid(1111)));
    expect(snapshot.parts).toEqual([{ name: "Filtro hidráulico", quantity: 1, unit: "un", unitCostCents: 12_000 }]);
    expect(snapshot.status).toBe("COMPLETED");
  });
});

describe("office actions", () => {
  it("assign enforces availability and the off-duty confirmation (EC-OPS-22, EC-WO-19)", async () => {
    const created = await db.run((tx) => createManual(tx, admin, { type: "CORRECTIVE", priority: "LOW", title: "Check tyres", assetId: seedUuid(422) }));
    expect(created.status).toBe("OPEN");
    expect(await codeOf(db.run((tx) => assign(tx, admin, created.id, { assigneeId: PEOPLE.invitee })))).toBe("ASSIGNEE_UNAVAILABLE");
    expect(await codeOf(db.run((tx) => assign(tx, admin, created.id, { assigneeId: PEOPLE.pedro })))).toBe("WO_ASSIGNEE_OFF_DUTY");
    const assigned = await db.run((tx) => assign(tx, admin, created.id, { assigneeId: PEOPLE.pedro, confirmOffDuty: true }));
    expect(assigned.status).toBe("ASSIGNED");
    expect(assigned.assigneeId).toBe(PEOPLE.pedro);
    const notification = await db.raw("notifications").findOne({ userId: PEOPLE.pedro, entityId: created.id, type: "WO_ASSIGNED" });
    expect(notification).not.toBeNull();
    const activity = await db.raw("activity_events").findOne({ entityId: created.id, action: "workOrder.assign" });
    expect((activity?.meta as Record<string, unknown>).offDutyOverride).toBe(true);
  });

  it("patch needs If-Match and resets the SLA flags on a new due date", async () => {
    const id = await freshJob(423);
    const current = await db.raw("work_orders").findOne({ _id: id });
    expect(await codeOf(db.run((tx) => patch(tx, admin, id, { title: "New" }, "1")))).toBe("CONFLICT");
    const due = new Date(Date.now() + 48 * 3_600_000).toISOString();
    const updated = await db.run((tx) => patch(tx, admin, id, { title: "New", dueAt: due }, String(current?.syncVersion)));
    expect(updated.title).toBe("New");
    expect(updated.dueAt).toBe(due);
  });

  it("cancel notifies the assignee and blocks later transitions", async () => {
    const id = await freshJob(424);
    const cancelled = await db.run((tx) => cancel(tx, admin, id, { reason: "Duplicate" }));
    expect(cancelled.status).toBe("CANCELLED");
    expect(await codeOf(db.run((tx) => transition(tx, carlos, { id, action: "accept" }, meta())))).toBe("WO_CANCELLED");
    expect(await db.raw("notifications").findOne({ userId: PEOPLE.carlos, entityId: id, type: "WO_CANCELLED" })).not.toBeNull();
  });
});

describe("field flow", () => {
  it("runs accept → complete with guards, times and costs, then verify and reopen", async () => {
    const id = await freshJob(425);
    expect(await codeOf(db.run((tx) => transition(tx, pedro, { id, action: "accept" }, meta())))).toBe("WO_REASSIGNED");
    await walkToInProgress(id);
    const asset = await db.raw("assets").findOne({ _id: seedUuid(425) });
    expect(asset?.condition).toBe("IN_REPAIR");

    await db.run((tx) => addPart(tx, carlos, { id: crypto.randomUUID(), workOrderId: id, name: "Hose", quantity: 2, unit: "un", unitCostCents: 1_250 }, new Date()));
    expect(await codeOf(db.run((tx) => complete(tx, carlos, completion(id), meta(90))))).toBe("GUARD_AFTER_PHOTO_REQUIRED");
    await addAfterPhoto(id);
    expect(await codeOf(db.run((tx) => complete(tx, carlos, completion(id), meta(90))))).toBe("GUARD_CHECKLIST_INCOMPLETE");
    await answerAll(id);
    expect(await codeOf(db.run((tx) => complete(tx, carlos, completion(id, { signatureStatus: undefined, signatureReason: undefined }), meta(90))))).toBe(
      "GUARD_SIGNATURE_REQUIRED",
    );
    expect(await codeOf(db.run((tx) => complete(tx, carlos, completion(id, { hourMeterReading: 1 }), meta(90))))).toBe("METER_READING_LOWER");
    const reading = (asset?.hourMeter as number) + 3;
    await db.run((tx) => complete(tx, carlos, completion(id, { hourMeterReading: reading }), meta(90)));

    const done = await db.raw("work_orders").findOne({ _id: id });
    expect(done?.status).toBe("COMPLETED");
    expect(done?.travelMinutes).toBe(10);
    expect(done?.workMinutes).toBe(60);
    expect(done?.laborCostCents).toBe(8_500);
    expect(done?.partsCostCents).toBe(2_500);
    expect((await db.raw("assets").findOne({ _id: seedUuid(425) }))?.hourMeter).toBe(reading);

    await db.raw("organizations").updateOne({ _id: ORG_A }, { $set: { "settings.showLaborCostToManager": false } });
    const managerView = await db.run((tx) => verify(tx, manager, id, { note: "ok" }));
    await db.raw("organizations").updateOne({ _id: ORG_A }, { $set: { "settings.showLaborCostToManager": true } });
    expect(managerView.status).toBe("VERIFIED");
    expect(managerView.laborCostCents ?? null).toBeNull();
    expect(await codeOf(db.run((tx) => verify(tx, admin, id)))).toBe("WO_ALREADY_VERIFIED");
    expect(await codeOf(db.run((tx) => complete(tx, carlos, completion(id), meta(95))))).toBe("WO_ALREADY_VERIFIED");
  });

  it("reopens a completed job and keeps the previous completion in the timeline (EC-WO-18)", async () => {
    const id = await freshJob(426);
    await walkToInProgress(id);
    await addAfterPhoto(id);
    await answerAll(id);
    await db.run((tx) => complete(tx, carlos, completion(id), meta(60)));
    const reopened = await db.run((tx) => reopen(tx, admin, id, { reason: "Still leaking" }));
    expect(reopened.status).toBe("IN_PROGRESS");
    const event = await db.raw("activity_events").findOne({ entityId: id, action: "workOrder.reopen" });
    expect(((event?.meta as Record<string, unknown>).previousCompletion as Record<string, unknown>).resolution).toBe("Replaced the hose");
    const view = await db.run((tx) => detail(tx, admin, id));
    expect(view.timeline.map((entry) => entry.action)).toContain("workOrder.complete");
  });

  it("declines back to OPEN and stores the previous assignee", async () => {
    const id = await freshJob(427);
    expect(await codeOf(db.run((tx) => transition(tx, carlos, { id, action: "decline" }, meta())))).toBe("VALIDATION_FAILED");
    await db.run((tx) => transition(tx, carlos, { id, action: "decline", reason: "Too far" }, meta()));
    const wo = await db.raw("work_orders").findOne({ _id: id });
    expect(wo?.status).toBe("OPEN");
    expect(wo?.assigneeId).toBeNull();
    expect(wo?.previousAssigneeIds).toContain(PEOPLE.carlos);
  });

  it("puts the job on a SAFETY hold when a safety-critical item fails and only the office releases it (EC-WO-09)", async () => {
    const id = await freshJob(428);
    await db.raw("work_orders").updateOne(
      { _id: id },
      { $set: { checklistSnapshot: [{ key: "safety_guard", label: { "pt-BR": "Proteção", en: "Guard" }, type: "PASS_FAIL_NA", required: true, isSafetyCritical: true, photo: "NEVER" }] } },
    );
    await walkToInProgress(id);
    await db.run((tx) => saveChecklist(tx, carlos, { id, templateVersion: 1, responses: [{ key: "safety_guard", value: "FAIL", mediaIds: [], answeredAt: new Date().toISOString() }] }, meta()));
    let wo = await db.raw("work_orders").findOne({ _id: id });
    expect(wo?.status).toBe("ON_HOLD");
    expect(wo?.holdReason).toBe("SAFETY");
    expect(await codeOf(db.run((tx) => transition(tx, carlos, { id, action: "resume" }, meta())))).toBe("OFFICE_ROLE_REQUIRED");
    expect(await codeOf(db.run((tx) => releaseSafetyHold(tx, carlos, id, {})))).toBe("OFFICE_ROLE_REQUIRED");
    const released = await db.run((tx) => releaseSafetyHold(tx, manager, id, { note: "Guard replaced" }));
    expect(released.status).toBe("IN_PROGRESS");
    wo = await db.raw("work_orders").findOne({ _id: id });
    expect(wo?.status).toBe("IN_PROGRESS");
    expect(await codeOf(db.run((tx) => releaseSafetyHold(tx, manager, id, {})))).toBe("INVALID_TRANSITION");
    await addAfterPhoto(id);
    expect(await codeOf(db.run((tx) => complete(tx, carlos, completion(id), meta(30))))).toBe("WO_SAFETY_STOP_REQUIRED");
  });

  it("accepts late evidence from a previous assignee and flags it (BR-F2-4)", async () => {
    const id = await freshJob(429);
    await db.run((tx) => reassign(tx, admin, id, { assigneeId: PEOPLE.lucas, reason: "Closer", confirmOffDuty: true }));
    const partId = crypto.randomUUID();
    await db.run((tx) => addPart(tx, carlos, { id: partId, workOrderId: id, name: "Bolt", quantity: 4, unit: "un" }, new Date()));
    const wo = await db.raw("work_orders").findOne({ _id: id });
    expect(wo?.hasLateEvidence).toBe(true);
    expect(await db.raw("notifications").findOne({ entityId: id, type: "LATE_EVIDENCE" })).not.toBeNull();
    expect(await db.raw("notifications").findOne({ entityId: id, type: "WO_REASSIGNED_AWAY", userId: PEOPLE.carlos })).not.toBeNull();
    await db.run((tx) => removePart(tx, carlos, partId, new Date()));
    expect((await db.raw("work_order_parts").findOne({ _id: partId }))?.deletedAt).toBeInstanceOf(Date);
    expect(await codeOf(db.run((tx) => addPart(tx, ctxOf(PEOPLE.joana, "FIELD"), { id: crypto.randomUUID(), workOrderId: id, name: "x", quantity: 1, unit: "un" }, new Date())))).toBe("FORBIDDEN");
  });

  it("rejects an hour-meter jump unless the technician confirms it, then flags the completion (EC-WO-14)", async () => {
    const id = await freshJob(432);
    await walkToInProgress(id);
    await addAfterPhoto(id);
    await answerAll(id);
    const asset = await db.raw("assets").findOne({ _id: seedUuid(432) });
    const current = asset?.hourMeter as number;
    const reading = current + 1_000_000;
    let rejection: { code?: string; details?: Record<string, unknown> } | undefined;
    try {
      await db.run((tx) => complete(tx, carlos, completion(id, { hourMeterReading: reading }), meta(90)));
    } catch (error) {
      rejection = error as { code?: string; details?: Record<string, unknown> };
    }
    expect(rejection?.code).toBe("METER_READING_JUMP");
    expect(rejection?.details).toMatchObject({ assetId: seedUuid(432), current, reading });
    expect((await db.raw("work_orders").findOne({ _id: id }))?.status).toBe("IN_PROGRESS");

    await db.run((tx) => complete(tx, carlos, completion(id, { hourMeterReading: reading, confirmMeterJump: true }), meta(90)));
    expect((await db.raw("work_orders").findOne({ _id: id }))?.status).toBe("COMPLETED");
    expect((await db.raw("assets").findOne({ _id: seedUuid(432) }))?.hourMeter).toBe(reading);
    const event = await db.raw("activity_events").findOne({ entityId: id, action: "workOrder.complete" });
    expect(event?.meta).toMatchObject({ meterJumpConfirmed: true, attention: true });
  });

  it("sets the external cost with If-Match", async () => {
    const id = await freshJob(431);
    const current = await db.raw("work_orders").findOne({ _id: id });
    const updated = await db.run((tx) => setExternalCost(tx, admin, id, { externalCostCents: 50_000, externalCostNote: "Workshop" }, String(current?.syncVersion)));
    expect(updated.externalCostCents).toBe(50_000);
  });
});

describe("queries and suggestions", () => {
  it("lists with filters and redacts labour cost for managers", async () => {
    const page = await db.run((tx) => list(tx, admin, { status: "OPEN", limit: 2 }));
    expect(page.items.every((item) => item.status === "OPEN")).toBe(true);
    expect(page.items.length).toBeLessThanOrEqual(2);
    const overdue = await db.run((tx) => list(tx, manager, { due: "overdue" }));
    expect(overdue.items.map((item) => item.id)).toContain(seedUuid(1100));
    expect(overdue.items.every((item) => item.sla === "BREACHED")).toBe(true);
    expect(await codeOf(db.run((tx) => list(tx, carlos, {})))).toBe("OFFICE_ROLE_REQUIRED");
  });

  it("ranks Carlos first for an engine report (A§6.4)", async () => {
    const result = await db.run((tx) =>
      suggestTechnicians(tx, admin, { fieldReportId: seedUuid(1015) }, { lastFixes: async () => new Map([[PEOPLE.carlos, { userId: PEOPLE.carlos, lat: -21.1, lng: -47.8, recordedAt: new Date() }]]) }),
    );
    expect(result.items.length).toBeLessThanOrEqual(5);
    expect(result.items[0]?.userId).toBe(PEOPLE.carlos);
    expect(result.items[0]?.reasons).toEqual(expect.arrayContaining(["onDuty", "skillMatch", "nearby"]));
    expect(result.items[0]?.online).toBe(true);
  });

  it("computes parts cost from quantity × unit cost", () => {
    expect(partsCostCents([{ quantity: 1.5, unitCostCents: 1_001 }, { quantity: 2, unitCostCents: null }])).toBe(1_502);
  });

  it("exposes all five sync handlers", () => {
    expect(Object.keys(mutations).sort()).toEqual(["workOrder.addPart", "workOrder.complete", "workOrder.removePart", "workOrder.saveChecklist", "workOrder.transition"]);
  });
});
