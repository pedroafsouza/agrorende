import { RentalCheckinPayloadSchema } from "@agrorende/contracts/mutations";

import { upsertMirrorRow } from "../../src/db/mirror";
import { checkCorrectedReading, findMeterJumpConflict, readingOf, replaceRejected } from "../../src/features/jobs/meterJump";
import { buildCheckinPayload, loadInspectionContext, newInspectionDraft, readingError, validateReadings, WALKAROUND_TAGS, type InspectionDraft } from "../../src/features/rentals/logic";
import { completeWorkOrder } from "../../src/sync/mutators/jobs";
import { listOutbox } from "../../src/sync/outbox";
import { pushPendingMutations } from "../../src/sync/push";
import { photo, seedRental } from "../helpers/rentals";
import { createTestRuntime, testId, USER_ID } from "../helpers/runtime";

const ISO = "2026-03-01T00:00:00.000Z";

async function seedJob(db: Parameters<typeof upsertMirrorRow>[0]) {
  const id = testId();
  const assetId = testId();
  await upsertMirrorRow(db, "assets", { id: assetId, organizationId: "org", syncVersion: 1, code: "TR-1", name: "Trator", hourMeter: 100, createdAt: ISO, updatedAt: ISO, deletedAt: null }, 0);
  const row = { id, organizationId: "org", syncVersion: 1, number: "OS-9", title: "Revisão", status: "IN_PROGRESS", priority: "MEDIUM", assigneeId: USER_ID, assetId, previousAssigneeIds: [], checklistSnapshot: [], checklistResponses: [], createdAt: ISO, updatedAt: ISO, deletedAt: null };
  await upsertMirrorRow(db, "workOrders", row, 0);
  return { id, assetId, row };
}

describe("meter jump conflicts (EC-WO-14)", () => {
  test("a rejected completion is found with the server details and replaced by a confirmed one", async () => {
    const { runtime, server } = await createTestRuntime();
    const { id, assetId, row } = await seedJob(runtime.db);
    await completeWorkOrder({ id, resolution: "Trocado o filtro", documentLocale: "pt-BR", hourMeterReading: 5000 }, { runtime });
    server.respond = (m) => ({ id: m.id, status: "REJECTED", code: "METER_READING_JUMP", message: "jump", details: { assetId, current: 100, reading: 5000, elapsedHours: 2 }, snapshot: { table: "workOrders", row: { ...row, syncVersion: 2 } } });
    expect((await pushPendingMutations(runtime)).rejected).toBe(1);

    const conflict = await findMeterJumpConflict(runtime.db, "WORK_ORDER", id, 100);
    expect(conflict).toMatchObject({ name: "workOrder.complete", last: 100, next: 5000, maxDelta: 48 });
    expect(await findMeterJumpConflict(runtime.db, "RENTAL", id)).toBeUndefined();
    if (conflict === undefined) throw new Error("conflict");

    await replaceRejected(runtime.db, conflict, () => completeWorkOrder({ ...(conflict.payload as { id: string; resolution: string; documentLocale: "pt-BR" }), confirmMeterJump: true }, { runtime }), "2026-03-01T13:00:00.000Z");
    const outbox = await listOutbox(runtime.db);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ name: "workOrder.complete", status: "PENDING", payload: { id, hourMeterReading: 5000, confirmMeterJump: true } });
    expect(await findMeterJumpConflict(runtime.db, "WORK_ORDER", id)).toBeUndefined();
  });

  test("without details the fallback reading is used and the bound is unknown", async () => {
    const { runtime, server } = await createTestRuntime();
    const { id, row } = await seedJob(runtime.db);
    await completeWorkOrder({ id, resolution: "Ok", documentLocale: "pt-BR", hourMeterReading: 900 }, { runtime });
    server.respond = (m) => ({ id: m.id, status: "REJECTED", code: "METER_READING_JUMP", message: "jump", snapshot: { table: "workOrders", row } });
    await pushPendingMutations(runtime);
    expect(await findMeterJumpConflict(runtime.db, "WORK_ORDER", id, 100)).toMatchObject({ last: 100, next: 900, maxDelta: null });
  });

  test("a corrected reading is checked with the same bounds before it is queued", () => {
    expect(checkCorrectedReading({ last: 100, maxDelta: 48 }, 90)).toBe("lower");
    expect(checkCorrectedReading({ last: 100, maxDelta: 48 }, 140)).toBe("ok");
    expect(checkCorrectedReading({ last: 100, maxDelta: 48 }, 200)).toBe("jump");
    expect(checkCorrectedReading({ last: null, maxDelta: null }, 1)).toBe("ok");
    expect(readingOf("rental.checkin", { inspection: { hourMeter: 4400 } })).toBe(4400);
    expect(readingOf("workOrder.complete", { hourMeterReading: 12 })).toBe(12);
  });
});

describe("rental check-in meter jump (EC-RN-26)", () => {
  test("a confirmed jump passes the readings step and is sent as meterJumpConfirmed", async () => {
    const { runtime } = await createTestRuntime();
    const seed = await seedRental(runtime.db, { status: "ACTIVE", extra: { actualStart: "2026-03-01T11:00:00.000Z" } });
    await upsertMirrorRow(runtime.db, "assets", { id: seed.assetId, organizationId: "org", syncVersion: 2, code: "TR-9", name: "Trator 9", category: "TRACTOR", isRentable: true, tankCapacityL: 300, hourMeter: 4312, currentRentalId: seed.rentalId, createdAt: ISO, updatedAt: ISO, deletedAt: null }, 0);
    const ctx = await loadInspectionContext(runtime.db, seed.rentalId, "CHECK_IN");
    if (ctx === undefined) throw new Error("context");
    const base = newInspectionDraft(ctx, { inspectionId: testId(), templateId: testId() });
    const nowMs = Date.parse("2026-03-01T13:00:00.000Z");
    const draft: InspectionDraft = { ...base, media: [...WALKAROUND_TAGS.map((tag) => photo(base.inspectionId, tag)), photo(base.inspectionId, "HOUR_METER"), photo(base.inspectionId, "FUEL_GAUGE")], hourMeter: 4900, fuelPercent: 50 };
    expect(readingError(draft, ctx, nowMs)).toBe("errors.METER_READING_JUMP.title");
    expect(buildCheckinPayload(draft).inspection.meterJumpConfirmed).toBeUndefined();

    const confirmed: InspectionDraft = { ...draft, meterJumpConfirmed: true };
    expect(readingError(confirmed, ctx, nowMs)).toBeUndefined();
    expect(validateReadings(confirmed, ctx, nowMs)).toBe(true);
    const payload = buildCheckinPayload(confirmed);
    expect(payload.inspection.meterJumpConfirmed).toBe(true);
    expect(RentalCheckinPayloadSchema.shape.inspection.safeParse({ ...payload.inspection, agentSignatureMediaId: testId(), signatureStatus: "ABSENT", signatureReason: "Cliente ausente" }).success).toBe(true);
    expect(readingError({ ...confirmed, hourMeter: 4000 }, ctx, nowMs)).toBe("errors.METER_READING_LOWER.title");
    expect(buildCheckinPayload({ ...confirmed, meterReplaced: true }).inspection.meterJumpConfirmed).toBeUndefined();
  });
});
