import type { MediaMeta } from "@agrorende/contracts/sync";

import type { MediaDraft } from "../../src/components/MediaCapture/drafts";
import { upsertMirrorRow } from "../../src/db/mirror";
import {
  acceptMediaChange,
  assetAttention,
  buildCreatePayload,
  canWithdraw,
  getReportDetail,
  isLocationWeak,
  listMyReports,
  newReportDraft,
  openCasesForAsset,
  REPORT_VIDEO_LIMIT,
  validateDetails,
  validateEvidence,
  validateMachine,
  validateReview,
  type ReportDraft,
} from "../../src/features/reports/logic";
import { loadDraft, saveDraft } from "../../src/lib/drafts";
import { persistCapture } from "../../src/media/capture";
import { listMediaFiles } from "../../src/media/queue";
import { createSyncEngine } from "../../src/sync/engine";
import { listOutbox } from "../../src/sync/outbox";
import { createReport, updateReport, withdrawReport } from "../../src/sync/mutators/reports";
import { FakeFiles } from "../helpers/fakeFiles";
import { createTestRuntime, testId, USER_ID } from "../helpers/runtime";

const NOW = "2026-03-01T12:00:00.000Z";

function media(reportId: string, kind: "PHOTO" | "VIDEO" | "AUDIO", id = testId()): MediaDraft {
  return {
    id,
    kind,
    tag: "DAMAGE",
    mimeType: kind === "VIDEO" ? "video/mp4" : kind === "AUDIO" ? "audio/m4a" : "image/jpeg",
    capturedAt: "2026-03-01T11:00:00.000Z",
    parent: { type: "FIELD_REPORT", id: reportId },
    localUri: `file:///docs/${id}`,
  };
}

function draft(overrides: Partial<ReportDraft> = {}): ReportDraft {
  const id = overrides.id ?? testId();
  return { ...newReportDraft(id, testId()), category: "HYDRAULIC", media: [media(id, "PHOTO")], ...overrides };
}

function asset(id: string, extra: Record<string, unknown> = {}) {
  return { id, code: "TR-1", name: "Trator 1", category: "TRACTOR", condition: "OPERATIONAL", currentRentalId: null, createdAt: NOW, updatedAt: NOW, deletedAt: null, ...extra };
}

describe("report wizard validation", () => {
  test("one photo and a category are enough to reach Send in four steps", () => {
    const d = draft();
    expect([validateMachine(d), validateEvidence(d), validateDetails(d), validateReview(d)]).toEqual([true, true, true, true]);
  });

  test("EC-FR-02: unregistered machine without a description blocks the Machine step", () => {
    expect(validateMachine({ unregisteredAssetDesc: "   " })).toBe("errors.REPORT_UNREGISTERED_MACHINE_INCOMPLETE.title");
    expect(validateMachine({})).toBe("errors.REPORT_UNREGISTERED_MACHINE_INCOMPLETE.title");
    expect(validateMachine({ unregisteredAssetDesc: "Trator azul perto do silo" })).toBe(true);
  });

  test("EC-FR-05: no photo or video blocks Evidence and Review; a voice note alone is not evidence", () => {
    const d = draft({ media: [] });
    expect(validateEvidence(d)).toBe("errors.REPORT_EVIDENCE_REQUIRED.title");
    expect(validateReview(d)).toBe("errors.REPORT_EVIDENCE_REQUIRED.title");
    expect(validateEvidence({ media: [media(d.id, "AUDIO")] })).toBe("errors.REPORT_EVIDENCE_REQUIRED.title");
    expect(validateEvidence({ media: [media(d.id, "VIDEO")] })).toBe(true);
  });

  test("EC-FR-06: the sixth video is refused and the other media stay", () => {
    const id = testId();
    const five = Array.from({ length: REPORT_VIDEO_LIMIT }, () => media(id, "VIDEO"));
    const photo = media(id, "PHOTO");
    const previous = [...five, photo];
    const sixth = media(id, "VIDEO");
    const change = acceptMediaChange(previous, [...previous, sixth]);
    expect(change.error).toBe("REPORT_VIDEO_LIMIT_EXCEEDED");
    expect(change.rejected.map((m) => m.id)).toEqual([sixth.id]);
    expect(change.media).toHaveLength(6);
    expect(change.media.filter((m) => m.kind === "VIDEO")).toHaveLength(REPORT_VIDEO_LIMIT);
    expect(validateEvidence({ media: [...previous, sixth] })).toBe("errors.REPORT_VIDEO_LIMIT_EXCEEDED.title");
    expect(acceptMediaChange(previous, [...previous, media(id, "PHOTO")]).rejected).toHaveLength(0);
    expect(acceptMediaChange(previous, five.slice(1)).error).toBeUndefined();
  });

  test("EC-FR-09: details need a category; the rest has safe defaults", () => {
    const { category: _c, ...rest } = draft();
    expect(validateDetails(rest)).toBe("errors.REPORT_DETAILS_INCOMPLETE.title");
  });

  test("EC-FR-10: missing or imprecise location is flagged but does not block", () => {
    expect(isLocationWeak({})).toBe(true);
    expect(isLocationWeak({ lat: -15, lng: -47, accuracyM: 500 })).toBe(true);
    expect(isLocationWeak({ lat: -15, lng: -47, accuracyM: 12 })).toBe(false);
    expect(validateReview(draft())).toBe(true);
  });

  test("the create payload falls back to the category title and re-parents media", () => {
    const d = draft({ title: "  ", description: " vazando " });
    const payload = buildCreatePayload(d, "Hidráulico");
    expect(payload).toMatchObject({ id: d.id, assetId: d.assetId, title: "Hidráulico", description: "vazando", category: "HYDRAULIC", priority: "MEDIUM", machineOperable: true });
    expect(payload.media[0]).not.toHaveProperty("localUri");
    expect(payload.media[0]?.parent).toEqual({ type: "FIELD_REPORT", id: d.id });
    const unregistered = buildCreatePayload(draft({ assetId: undefined, unregisteredAssetDesc: " Trator azul " }), "x");
    expect(unregistered).toMatchObject({ unregisteredAssetDesc: "Trator azul" });
    expect(unregistered).not.toHaveProperty("assetId");
  });
});

describe("report mutators", () => {
  test("6 photos + 1 video become one SUBMITTED report with 7 media, released for upload after push", async () => {
    const { runtime, server } = await createTestRuntime();
    const files = new FakeFiles();
    const assetId = testId();
    await upsertMirrorRow(runtime.db, "assets", asset(assetId), 0);
    const id = testId();
    const evidence = [...Array.from({ length: 6 }, () => media(id, "PHOTO")), media(id, "VIDEO")];
    for (const m of evidence) {
      const { localUri: _uri, thumbUri: _thumb, ...meta } = m;
      await persistCapture(runtime.db, files, { meta: meta as MediaMeta, sourceUri: files.add(`file:///tmp/${m.id}`, 1000) });
    }
    const payload = buildCreatePayload({ ...newReportDraft(id, assetId), category: "LEAK", media: evidence }, "Vazamento");
    await createReport(payload, { runtime, lat: -15.6, lng: -47.7 });

    const mine = await listMyReports(runtime.db, USER_ID);
    expect(mine).toEqual([expect.objectContaining({ id, status: "SUBMITTED", title: "Vazamento", assetName: "Trator 1", pending: true })]);
    const detail = await getReportDetail(runtime.db, id);
    expect(detail?.media).toHaveLength(7);
    const outbox = await listOutbox(runtime.db);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ name: "fieldReport.create", entityType: "FIELD_REPORT", entityId: id });
    expect((outbox[0]?.payload as { media: unknown[] }).media).toHaveLength(7);
    expect((await listMediaFiles(runtime.db)).every((f) => f.state === "WAITING_PARENT")).toBe(true);

    const engine = createSyncEngine(runtime, { media: async () => undefined });
    await engine.syncNow("manual");
    engine.dispose();
    expect(server.pushes[0]?.mutations.map((m) => m.name)).toEqual(["fieldReport.create"]);
    expect((await listMediaFiles(runtime.db)).every((f) => f.state === "QUEUED")).toBe(true);
    expect((await listMyReports(runtime.db, USER_ID))[0]?.pending).toBe(false);
  });

  test("withdraw closes a SUBMITTED report for its reporter; update patches fields", async () => {
    const { runtime } = await createTestRuntime();
    const d = draft();
    await createReport(buildCreatePayload(d, "Hidráulico"), { runtime });
    await updateReport({ id: d.id, patch: { priority: "HIGH" } }, { runtime });
    let detail = await getReportDetail(runtime.db, d.id);
    expect(detail?.report.priority).toBe("HIGH");
    expect(canWithdraw(detail!.report, USER_ID)).toBe(true);
    expect(canWithdraw(detail!.report, testId())).toBe(false);
    await withdrawReport({ id: d.id, reason: "Máquina errada" }, { runtime });
    detail = await getReportDetail(runtime.db, d.id);
    expect(detail?.report).toMatchObject({ status: "DISMISSED", statusReason: "WITHDRAWN: Máquina errada", flags: { withdrawn: true } });
    expect(canWithdraw(detail!.report, USER_ID)).toBe(false);
  });

  test("EC-FR-04 / EC-FR-16: attention reasons and open cases for the same asset", async () => {
    const { runtime } = await createTestRuntime();
    const assetId = testId();
    expect(assetAttention(asset(assetId, { condition: "IN_REPAIR", currentRentalId: testId() }))).toEqual(["IN_REPAIR", "RENTED_OUT"]);
    expect(assetAttention(asset(assetId))).toEqual([]);
    const open = draft({ assetId });
    await createReport(buildCreatePayload(open, "Hidráulico"), { runtime });
    await upsertMirrorRow(runtime.db, "workOrders", { id: testId(), number: "OS-1", status: "IN_PROGRESS", assetId, title: "Troca", createdAt: NOW, updatedAt: NOW, deletedAt: null }, 0);
    await upsertMirrorRow(runtime.db, "workOrders", { id: testId(), number: "OS-0", status: "VERIFIED", assetId, title: "Antiga", createdAt: NOW, updatedAt: NOW, deletedAt: null }, 0);
    const cases = await openCasesForAsset(runtime.db, assetId, testId());
    expect(cases.map((c) => c.kind)).toEqual(["workOrder", "report"]);
    expect(await openCasesForAsset(runtime.db, assetId, open.id)).toHaveLength(1);
  });
});

describe("report drafts", () => {
  test("EC-FR-12: a wizard draft survives sync engine recreation", async () => {
    const { runtime } = await createTestRuntime();
    const d = draft();
    await saveDraft(runtime.db, { id: d.id, kind: "FIELD_REPORT", refId: null, step: "details", payload: d, updatedAt: NOW });
    const first = createSyncEngine(runtime);
    await first.syncNow("manual");
    first.dispose();
    const second = createSyncEngine(runtime);
    await second.syncNow("manual");
    second.dispose();
    const restored = await loadDraft<ReportDraft>(runtime.db, d.id);
    expect(restored).toMatchObject({ step: "details", payload: { id: d.id, category: "HYDRAULIC" } });
    expect(restored?.payload.media).toHaveLength(1);
  });
});
