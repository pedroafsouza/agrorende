import type { ChecklistItem } from "@agrorende/contracts/checklist";

import { getMirrorRow, upsertMirrorRow } from "../../src/db/mirror";
import {
  actionPlan,
  bucketJobs,
  completionBlock,
  jobNavigationUrl,
  jobNotice,
  listMyJobs,
  meterCheck,
  nextJob,
  parseCents,
  partsTotalCents,
  validatePart,
  type CompletionInput,
  type JobListItem,
} from "../../src/features/jobs/logic";
import { listOutbox } from "../../src/sync/outbox";
import { addPart, completeWorkOrder, mergeResponses, removePart, saveChecklist, transitionWorkOrder } from "../../src/sync/mutators/jobs";
import { createTestRuntime, testId, USER_ID } from "../helpers/runtime";

jest.mock("react-native", () => ({ Linking: { openURL: jest.fn(), canOpenURL: jest.fn() }, Platform: { OS: "ios" } }));

const NOW = Date.parse("2026-03-02T12:00:00.000Z");
const ISO = new Date(NOW).toISOString();
const OTHER = "01900000-0000-7000-8000-0000000000bb";

function job(overrides: Partial<JobListItem> = {}): JobListItem {
  return { id: testId(), number: "OS-1", title: "Trocar mangueira", status: "ASSIGNED", priority: "MEDIUM", dueAt: null, scheduledFor: null, completedAt: null, cancelledAt: null, updatedAt: ISO, assetName: null, siteName: null, holdReason: null, pending: false, ...overrides };
}

function woRow(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    organizationId: "org",
    syncVersion: 1,
    createdAt: ISO,
    updatedAt: ISO,
    deletedAt: null,
    number: "OS-7",
    type: "CORRECTIVE",
    status: "ASSIGNED",
    priority: "HIGH",
    title: "Vazamento hidráulico",
    assigneeId: USER_ID,
    previousAssigneeIds: [],
    checklistSnapshot: [],
    checklistResponses: [],
    ...extra,
  };
}

const SAFETY_ITEMS: ChecklistItem[] = [
  { key: "brakes", label: { "pt-BR": "Freios", en: "Brakes" }, type: "PASS_FAIL_NA", required: true, isSafetyCritical: true, photo: "NEVER" } as unknown as ChecklistItem,
  { key: "oil", label: { "pt-BR": "Óleo", en: "Oil" }, type: "PASS_FAIL_NA", required: true, isSafetyCritical: false, photo: "NEVER" } as unknown as ChecklistItem,
];

describe("job list buckets (WO-03)", () => {
  test("in-field and due-today jobs go to Today, later ones to Upcoming, closed ones in the last week to Done", () => {
    const enRoute = job({ status: "EN_ROUTE", scheduledFor: "2026-03-09T12:00:00.000Z" });
    const dueToday = job({ dueAt: "2026-03-02T15:00:00.000Z", priority: "CRITICAL" });
    const later = job({ scheduledFor: "2026-03-05T12:00:00.000Z" });
    const doneRecent = job({ status: "COMPLETED", completedAt: "2026-02-28T12:00:00.000Z" });
    const doneOld = job({ status: "COMPLETED", completedAt: "2026-02-01T12:00:00.000Z" });
    const buckets = bucketJobs([later, dueToday, enRoute, doneRecent, doneOld], NOW);
    expect(buckets.today.map((j) => j.id)).toEqual([enRoute.id, dueToday.id]);
    expect(buckets.upcoming.map((j) => j.id)).toEqual([later.id]);
    expect(buckets.done.map((j) => j.id)).toEqual([doneRecent.id]);
    expect(nextJob([later, dueToday], NOW)?.id).toBe(dueToday.id);
  });

  test("listMyJobs reads only the user's jobs and flags unsent changes", async () => {
    const { runtime } = await createTestRuntime();
    const mine = testId();
    await upsertMirrorRow(runtime.db, "workOrders", woRow(mine), 1);
    await upsertMirrorRow(runtime.db, "workOrders", woRow(testId(), { assigneeId: OTHER }), 0);
    const list = await listMyJobs(runtime.db, USER_ID);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: mine, number: "OS-7", pending: true });
  });
});

describe("action plan from the state machine (WO-04)", () => {
  const plan = (status: Parameters<typeof actionPlan>[0]["status"], extra: Partial<Parameters<typeof actionPlan>[0]> = {}) =>
    actionPlan({ status, assigneeId: USER_ID, holdReason: null, ...extra }, USER_ID, "FIELD");

  test("one primary action per state", () => {
    expect(plan("ASSIGNED")).toEqual({ primary: "accept", secondary: ["decline"] });
    expect(plan("ACCEPTED").primary).toBe("startRoute");
    expect(plan("EN_ROUTE")).toEqual({ primary: "arrive", secondary: ["abortRoute"] });
    expect(plan("ON_SITE").primary).toBe("startWork");
    expect(plan("IN_PROGRESS")).toEqual({ primary: "complete", secondary: ["hold"] });
    expect(plan("ON_HOLD", { holdReason: "WAITING_PARTS" }).primary).toBe("resume");
  });

  test("EC-WO-09: a safety hold cannot be resumed from the phone", () => {
    expect(plan("ON_HOLD", { holdReason: "SAFETY" })).toEqual({ primary: undefined, secondary: [], blocked: "safetyHold" });
  });

  test("EC-WO-03 / EC-WO-04: cancelled or reassigned jobs offer no action", () => {
    expect(plan("CANCELLED").blocked).toBe("cancelled");
    expect(plan("VERIFIED").blocked).toBe("closed");
    expect(plan("ACCEPTED", { assigneeId: OTHER }).blocked).toBe("reassigned");
  });

  test("notices for office changes", () => {
    expect(jobNotice({ status: "CANCELLED" }, undefined, USER_ID)).toBe("WO_CANCELLED");
    expect(jobNotice({ status: "ACCEPTED", assigneeId: OTHER, previousAssigneeIds: [USER_ID] }, undefined, USER_ID)).toBe("WO_REASSIGNED");
    expect(jobNotice({ status: "ON_HOLD", holdReason: "SAFETY", assigneeId: USER_ID }, undefined, USER_ID)).toBe("WO_SAFETY_STOP_REQUIRED");
    expect(jobNotice({ status: "IN_PROGRESS", assigneeId: USER_ID }, { condition: "RETIRED" }, USER_ID)).toBe("WO_ASSET_RETIRED");
  });
});

describe("navigation (WO-05, EC-WO-07)", () => {
  test("job pin wins over the site, and each app gets its own link", () => {
    const wo = { title: "OS", destLat: -15.6, destLng: -47.7 };
    expect(jobNavigationUrl(wo, undefined, "waze", "android")).toBe("waze://?ll=-15.6,-47.7&navigate=yes");
    expect(jobNavigationUrl(wo, undefined, "google", "android")).toContain("google.navigation:q=-15.6,-47.7");
    expect(jobNavigationUrl(wo, undefined, "apple", "ios")).toContain("maps://?daddr=-15.6,-47.7");
    expect(jobNavigationUrl({ title: "OS" }, { name: "Fazenda", lat: -10, lng: -50 }, "waze", "ios")).toBe("waze://?ll=-10,-50&navigate=yes");
  });

  test("falls back to the site address, then fails with WO_DESTINATION_MISSING", () => {
    expect(jobNavigationUrl({ title: "OS" }, { name: "Fazenda", lat: null, lng: null, address: "Rod. BR-070 km 5", city: "Cristalina" }, "waze", "ios")).toContain("waze://?q=");
    expect(() => jobNavigationUrl({ title: "OS" }, undefined, "waze", "ios")).toThrow(expect.objectContaining({ code: "WO_DESTINATION_MISSING" }));
    expect(() => jobNavigationUrl({ title: "OS" }, { name: "Fazenda", lat: null, lng: null }, "waze", "ios")).toThrow(expect.objectContaining({ code: "WO_DESTINATION_MISSING" }));
  });
});

describe("completion guards (WO-10, EC-WO-10..14)", () => {
  const input = (extra: Partial<CompletionInput> = {}): CompletionInput => ({
    status: "IN_PROGRESS",
    isAssignee: true,
    afterPhotoCount: 1,
    checklistItems: [],
    checklistResponses: [],
    requireWoSignature: true,
    assetHourMeter: 100,
    hoursSinceReading: 10,
    ...extra,
  });
  const signed = { resolution: "Troquei a mangueira", signatureStatus: "SIGNED" as const, customerSignerName: "João", signatureMediaId: testId() };

  test("each missing piece points to its field", () => {
    expect(completionBlock({ ...signed, resolution: " " }, input())).toEqual({ code: "GUARD_RESOLUTION_REQUIRED", field: "resolution" });
    expect(completionBlock(signed, input({ afterPhotoCount: 0 }))).toEqual({ code: "GUARD_AFTER_PHOTO_REQUIRED", field: "afterPhoto" });
    expect(completionBlock({ resolution: "ok" }, input())?.field).toBe("signature");
    expect(completionBlock({ ...signed, signatureMediaId: undefined }, input())?.code).toBe("GUARD_SIGNATURE_REQUIRED");
    expect(completionBlock({ resolution: "ok" }, input({ requireWoSignature: false }))).toBeUndefined();
    expect(completionBlock({ resolution: "ok", signatureStatus: "ABSENT", signatureReason: "Viajou" }, input())).toBeUndefined();
    expect(completionBlock(signed, input())).toBeUndefined();
  });

  test("checklist: incomplete and safety failures block", () => {
    const responses = [{ key: "brakes", value: "FAIL" as const, mediaIds: [], answeredAt: ISO }, { key: "oil", value: "PASS" as const, mediaIds: [], answeredAt: ISO }];
    expect(completionBlock(signed, input({ checklistItems: SAFETY_ITEMS, checklistResponses: responses.slice(1) }))).toEqual({ code: "GUARD_CHECKLIST_INCOMPLETE", field: "checklist" });
    expect(completionBlock(signed, input({ checklistItems: SAFETY_ITEMS, checklistResponses: responses }))).toEqual({ code: "WO_SAFETY_STOP_REQUIRED", field: "checklist" });
  });

  test("EC-WO-14: lower readings need a replaced meter with photo; jumps need confirmation", () => {
    const base = { assetHourMeter: 100, hoursSinceReading: 10 };
    expect(meterCheck({ resolution: "x", hourMeterReading: 90 }, base)).toBe("METER_READING_LOWER");
    expect(meterCheck({ resolution: "x", hourMeterReading: 90, meterReplaced: true }, base)).toBe("METER_READING_LOWER");
    expect(meterCheck({ resolution: "x", hourMeterReading: 5, meterReplaced: true, meterPhotoMediaId: testId() }, base)).toBeUndefined();
    expect(meterCheck({ resolution: "x", hourMeterReading: 500 }, base)).toBe("METER_READING_JUMP");
    expect(meterCheck({ resolution: "x", hourMeterReading: 500, jumpConfirmed: true }, base)).toBeUndefined();
    expect(meterCheck({ resolution: "x", hourMeterReading: 110 }, base)).toBeUndefined();
    expect(completionBlock({ ...signed, hourMeterReading: 90 }, input())).toEqual({ code: "METER_READING_LOWER", field: "hourMeter" });
  });
});

describe("parts (WO-09)", () => {
  test("parses pt-BR money and validates the row", () => {
    expect(parseCents("12,50")).toBe(1250);
    expect(parseCents("R$ 1.234,56")).toBe(123456);
    expect(parseCents("")).toBeUndefined();
    expect(Number.isNaN(parseCents("abc"))).toBe(true);
    expect(validatePart({ name: "", quantity: 1, unit: "un", unitCost: "" })).toBe("name");
    expect(validatePart({ name: "Filtro", quantity: 0, unit: "un", unitCost: "" })).toBe("quantity");
    expect(validatePart({ name: "Filtro", quantity: 1, unit: "un", unitCost: "x" })).toBe("unitCost");
    expect(validatePart({ name: "Filtro", quantity: 2, unit: "un", unitCost: "10" })).toBe(true);
    expect(partsTotalCents([{ quantity: 2, unitCostCents: 1250 }, { quantity: 1, unitCostCents: null }])).toBe(2500);
  });
});

describe("job mutators (optimistic writes + outbox)", () => {
  test("accept → startRoute → arrive → startWork stamps each step and queues commands", async () => {
    const { runtime } = await createTestRuntime();
    const id = testId();
    await upsertMirrorRow(runtime.db, "workOrders", woRow(id), 0);
    for (const action of ["accept", "startRoute", "arrive", "startWork"] as const) await transitionWorkOrder({ id, action }, { runtime });
    const row = await getMirrorRow(runtime.db, "workOrders", id);
    expect(row).toMatchObject({ status: "IN_PROGRESS" });
    for (const stamp of ["acceptedAt", "enRouteAt", "arrivedAt", "startedAt"]) expect(typeof row?.[stamp]).toBe("string");
    const outbox = await listOutbox(runtime.db);
    expect(outbox.map((o) => [o.name, (o.payload as { action: string }).action])).toEqual([
      ["workOrder.transition", "accept"],
      ["workOrder.transition", "startRoute"],
      ["workOrder.transition", "arrive"],
      ["workOrder.transition", "startWork"],
    ]);
  });

  test("decline clears the assignee; hold and resume set and clear the reason", async () => {
    const { runtime } = await createTestRuntime();
    const declined = testId();
    await upsertMirrorRow(runtime.db, "workOrders", woRow(declined), 0);
    await transitionWorkOrder({ id: declined, action: "decline", reason: "Sem carro hoje" }, { runtime });
    expect(await getMirrorRow(runtime.db, "workOrders", declined)).toMatchObject({ status: "OPEN", assigneeId: null, previousAssigneeIds: [USER_ID] });

    const held = testId();
    await upsertMirrorRow(runtime.db, "workOrders", woRow(held, { status: "IN_PROGRESS" }), 0);
    await transitionWorkOrder({ id: held, action: "hold", holdReason: "WAITING_PARTS", note: "Filtro" }, { runtime });
    expect(await getMirrorRow(runtime.db, "workOrders", held)).toMatchObject({ status: "ON_HOLD", holdReason: "WAITING_PARTS", holdNote: "Filtro" });
    await transitionWorkOrder({ id: held, action: "resume" }, { runtime });
    expect(await getMirrorRow(runtime.db, "workOrders", held)).toMatchObject({ status: "IN_PROGRESS", holdReason: null });
  });

  test("EC-WO-09: a new safety-critical FAIL puts the job on a SAFETY hold", async () => {
    const { runtime } = await createTestRuntime();
    const id = testId();
    await upsertMirrorRow(runtime.db, "workOrders", woRow(id, { status: "IN_PROGRESS", checklistSnapshot: SAFETY_ITEMS }), 0);
    await saveChecklist({ id, templateVersion: 1, responses: [{ key: "oil", value: "PASS", mediaIds: [], answeredAt: ISO }] }, { runtime });
    expect(await getMirrorRow(runtime.db, "workOrders", id)).toMatchObject({ status: "IN_PROGRESS" });
    await saveChecklist({ id, templateVersion: 1, responses: [{ key: "brakes", value: "FAIL", mediaIds: [], answeredAt: ISO }] }, { runtime });
    const row = await getMirrorRow(runtime.db, "workOrders", id);
    expect(row).toMatchObject({ status: "ON_HOLD", holdReason: "SAFETY" });
    expect((row?.checklistResponses as unknown[]).length).toBe(2);
  });

  test("mergeResponses keeps the newer answer per key", () => {
    const old = { key: "oil", value: "FAIL" as const, mediaIds: [], answeredAt: "2026-03-01T10:00:00.000Z" };
    const fresh = { key: "oil", value: "PASS" as const, mediaIds: [], answeredAt: "2026-03-01T11:00:00.000Z" };
    expect(mergeResponses([fresh], [old])).toEqual([fresh]);
    expect(mergeResponses([old], [fresh])).toEqual([fresh]);
  });

  test("complete, addPart and removePart", async () => {
    const { runtime } = await createTestRuntime();
    const id = testId();
    await upsertMirrorRow(runtime.db, "workOrders", woRow(id, { status: "IN_PROGRESS" }), 0);
    const partId = testId();
    await addPart({ id: partId, workOrderId: id, name: "Mangueira", quantity: 2, unit: "un", unitCostCents: 4500 }, { runtime });
    expect(await getMirrorRow(runtime.db, "workOrderParts", partId)).toMatchObject({ workOrderId: id, addedById: USER_ID, deletedAt: null });
    await removePart({ id: partId }, { runtime });
    expect(typeof (await getMirrorRow(runtime.db, "workOrderParts", partId))?.deletedAt).toBe("string");
    await completeWorkOrder({ id, resolution: "Troquei a mangueira", documentLocale: "pt-BR", signatureStatus: "ABSENT", signatureReason: "Cliente viajou", hourMeterReading: 120 }, { runtime });
    expect(await getMirrorRow(runtime.db, "workOrders", id)).toMatchObject({ status: "COMPLETED", resolution: "Troquei a mangueira", hourMeterReading: 120, signatureStatus: "ABSENT" });
    expect((await listOutbox(runtime.db)).map((o) => o.name)).toEqual(["workOrder.addPart", "workOrder.removePart", "workOrder.complete"]);
  });
});
