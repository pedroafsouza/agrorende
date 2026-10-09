import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { upsertMirrorRow } from "../../src/db/mirror";
import { JobCompleteScreen } from "../../src/features/jobs/JobCompleteScreen";
import { JobDetailScreen } from "../../src/features/jobs/JobDetailScreen";
import { buildCheckinPayload, loadInspectionContext, newInspectionDraft, WALKAROUND_TAGS } from "../../src/features/rentals/logic";
import { RentalDetailScreen } from "../../src/features/rentals/RentalDetailScreen";
import { setServices } from "../../src/lib/services";
import { completeWorkOrder } from "../../src/sync/mutators/jobs";
import { checkinRental } from "../../src/sync/mutators/rentals";
import { listOutbox } from "../../src/sync/outbox";
import { pushPendingMutations } from "../../src/sync/push";
import { setSyncRuntime } from "../../src/sync/runtime";
import { photo, seedRental } from "../helpers/rentals";
import { createTestRuntime, testId, USER_ID } from "../helpers/runtime";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }), useLocalSearchParams: () => ({}) }));
jest.mock("../../src/components/MediaCapture", () => ({ Thumbnails: () => null, MediaCapture: () => null }));
jest.mock("../../src/components/SignaturePad", () => ({ SignaturePad: () => null }));
jest.mock("expo-haptics", () => ({ notificationAsync: jest.fn(async () => undefined), impactAsync: jest.fn(async () => undefined), selectionAsync: jest.fn(async () => undefined), NotificationFeedbackType: {}, ImpactFeedbackStyle: {} }));

const NOW = Date.parse("2026-03-01T13:00:00.000Z");
const ISO = "2026-03-01T12:00:00.000Z";

async function seedJob(db: Parameters<typeof upsertMirrorRow>[0]) {
  const id = testId();
  const assetId = testId();
  await upsertMirrorRow(db, "organization", { id: "org", name: "Fazenda", timezone: "America/Sao_Paulo", locale: "pt-BR", currency: "BRL", settings: { requireWoSignature: false }, syncVersion: 1, createdAt: ISO, updatedAt: ISO }, 0);
  await upsertMirrorRow(db, "assets", { id: assetId, organizationId: "org", syncVersion: 1, code: "TR-1", name: "Trator", hourMeter: 100, createdAt: ISO, updatedAt: ISO, deletedAt: null }, 0);
  await upsertMirrorRow(db, "media", { id: testId(), organizationId: "org", syncVersion: 1, kind: "PHOTO", tag: "AFTER", mimeType: "image/jpeg", parent: { type: "WORK_ORDER", id }, capturedAt: ISO, createdAt: ISO, updatedAt: ISO, deletedAt: null }, 0);
  const row = { id, organizationId: "org", syncVersion: 1, number: "OS-9", title: "Revisão", status: "IN_PROGRESS", priority: "MEDIUM", assigneeId: USER_ID, assetId, previousAssigneeIds: [], checklistSnapshot: [], checklistResponses: [], createdAt: ISO, updatedAt: ISO, deletedAt: null };
  await upsertMirrorRow(db, "workOrders", row, 0);
  return { id, assetId, row };
}

describe("job completion meter jump (EC-WO-14)", () => {
  test("a big jump opens Confirm reading; confirming queues the completion with confirmMeterJump", async () => {
    const { runtime } = await createTestRuntime();
    setSyncRuntime(runtime);
    const { id } = await seedJob(runtime.db);
    setServices({ db: runtime.db, userId: USER_ID, now: () => NOW });
    await render(<JobCompleteScreen id={id} />);
    await fireEvent.changeText(await screen.findByTestId("job-complete-resolution"), "Trocado o filtro");
    await fireEvent.changeText(screen.getByTestId("job-complete-hour-meter"), "5000");
    await fireEvent.press(screen.getByTestId("job-complete-submit"));
    expect(await screen.findByTestId("confirm-dialog")).toBeTruthy();
    expect(screen.getByText("Esta leitura está muito acima da última: 100 h → 5.000 h.")).toBeTruthy();
    expect(await listOutbox(runtime.db)).toHaveLength(0);

    await fireEvent.press(screen.getByText("Confirmar leitura"));
    await waitFor(async () => expect((await listOutbox(runtime.db)).map((row) => row.name)).toEqual(["workOrder.complete"]));
    const [queued] = await listOutbox(runtime.db);
    expect(queued?.payload).toMatchObject({ id, hourMeterReading: 5000, confirmMeterJump: true });
  });

  test("Fix reading closes the dialog and keeps the job open for a new number", async () => {
    const { runtime } = await createTestRuntime();
    setSyncRuntime(runtime);
    const { id } = await seedJob(runtime.db);
    setServices({ db: runtime.db, userId: USER_ID, now: () => NOW });
    await render(<JobCompleteScreen id={id} />);
    await fireEvent.changeText(await screen.findByTestId("job-complete-resolution"), "Trocado o filtro");
    await fireEvent.changeText(screen.getByTestId("job-complete-hour-meter"), "5000");
    await fireEvent.press(screen.getByTestId("job-complete-submit"));
    await fireEvent.press(await screen.findByText("Corrigir leitura"));
    await waitFor(() => expect(screen.queryByTestId("confirm-dialog")).toBeNull());
    expect(screen.getByTestId("job-complete-error-hourMeter")).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId("job-complete-hour-meter"), "110");
    await fireEvent.press(screen.getByTestId("job-complete-submit"));
    await waitFor(async () => expect(await listOutbox(runtime.db)).toHaveLength(1));
    const [queued] = await listOutbox(runtime.db);
    expect(queued?.payload).toMatchObject({ hourMeterReading: 110 });
    expect((queued?.payload as { confirmMeterJump?: boolean }).confirmMeterJump).toBeUndefined();
  });

  test("a server rejection after sync shows the banner; Confirm reading requeues with the flag", async () => {
    const { runtime, server } = await createTestRuntime();
    setSyncRuntime(runtime);
    const { id, assetId, row } = await seedJob(runtime.db);
    await completeWorkOrder({ id, resolution: "Trocado", documentLocale: "pt-BR", hourMeterReading: 5000 }, { runtime });
    server.respond = (m) => ({ id: m.id, status: "REJECTED", code: "METER_READING_JUMP", message: "jump", details: { assetId, current: 100, reading: 5000, elapsedHours: 1 }, snapshot: { table: "workOrders", row: { ...row, syncVersion: 2 } } });
    await pushPendingMutations(runtime);
    server.respond = (m) => ({ id: m.id, status: "RETRY", retryAfterMs: 60_000 });
    setServices({ db: runtime.db, userId: USER_ID, now: () => NOW });
    await render(<JobDetailScreen id={id} />);
    expect(await screen.findByTestId("job-meter-jump")).toBeTruthy();
    expect(await screen.findByText("Esta leitura está muito acima da última: 100 h → 5.000 h.")).toBeTruthy();
    await fireEvent.press(screen.getByText("Confirmar leitura"));
    await waitFor(async () => {
      const outbox = await listOutbox(runtime.db);
      expect(outbox).toHaveLength(1);
      expect(outbox[0]).toMatchObject({ name: "workOrder.complete", payload: { hourMeterReading: 5000, confirmMeterJump: true } });
      expect(outbox[0]?.status).not.toBe("REJECTED");
    });
  });

  test("Fix reading on a rejection sends the corrected number without the flag", async () => {
    const { runtime, server } = await createTestRuntime();
    setSyncRuntime(runtime);
    const { id, assetId, row } = await seedJob(runtime.db);
    await completeWorkOrder({ id, resolution: "Trocado", documentLocale: "pt-BR", hourMeterReading: 5000 }, { runtime });
    server.respond = (m) => ({ id: m.id, status: "REJECTED", code: "METER_READING_JUMP", message: "jump", details: { assetId, current: 100, reading: 5000, elapsedHours: 1 }, snapshot: { table: "workOrders", row } });
    await pushPendingMutations(runtime);
    server.respond = (m) => ({ id: m.id, status: "RETRY", retryAfterMs: 60_000 });
    setServices({ db: runtime.db, userId: USER_ID, now: () => NOW });
    await render(<JobDetailScreen id={id} />);
    await fireEvent.press(await screen.findByText("Corrigir leitura"));
    await fireEvent.changeText(await screen.findByTestId("job-meter-jump-reading"), "90");
    await fireEvent.press(screen.getByTestId("job-meter-jump-send"));
    expect(await screen.findByTestId("job-meter-jump-lower")).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId("job-meter-jump-reading"), "120");
    await fireEvent.press(screen.getByTestId("job-meter-jump-send"));
    await waitFor(async () => {
      const outbox = await listOutbox(runtime.db);
      expect(outbox).toHaveLength(1);
      expect(outbox[0]?.payload).toMatchObject({ hourMeterReading: 120 });
      expect((outbox[0]?.payload as { confirmMeterJump?: boolean }).confirmMeterJump).toBeUndefined();
    });
  });
});

describe("rental check-in meter jump (EC-RN-26)", () => {
  test("a rejected check-in shows the banner on the rental; Confirm reading requeues with meterJumpConfirmed", async () => {
    const { runtime, server } = await createTestRuntime();
    setSyncRuntime(runtime);
    const seed = await seedRental(runtime.db, { status: "ACTIVE", extra: { actualStart: "2026-03-01T11:00:00.000Z" } });
    const ctx = await loadInspectionContext(runtime.db, seed.rentalId, "CHECK_IN");
    if (ctx === undefined) throw new Error("context");
    const base = newInspectionDraft(ctx, { inspectionId: testId(), templateId: testId() });
    const id = base.inspectionId;
    const payload = buildCheckinPayload({
      ...base,
      identityConfirmed: true,
      media: [...WALKAROUND_TAGS.map((tag) => photo(id, tag)), photo(id, "HOUR_METER"), photo(id, "FUEL_GAUGE")],
      hourMeter: 4900,
      fuelPercent: 90,
      responses: [{ key: "tires", value: "PASS", answeredAt: ISO }],
      signatureStatus: "ABSENT",
      signatureReason: "Cliente ausente na devolução",
      agentSignature: photo(id, "SIGNATURE_AGENT", { kind: "SIGNATURE", mimeType: "image/png" }),
    });
    await checkinRental(payload, { runtime });
    server.respond = (m) => ({ id: m.id, status: "REJECTED", code: "METER_READING_JUMP", message: "jump", details: { field: "hourMeter", previous: 4312, value: 4900, maxDelta: 3 } });
    await pushPendingMutations(runtime);
    server.respond = (m) => ({ id: m.id, status: "RETRY", retryAfterMs: 60_000 });
    setServices({ db: runtime.db, userId: USER_ID, now: () => NOW });
    await render(<RentalDetailScreen rentalId={seed.rentalId} />);
    expect(await screen.findByTestId("rental-meter-jump")).toBeTruthy();
    expect(await screen.findByText("Esta leitura está muito acima da última: 4.312 h → 4.900 h.")).toBeTruthy();
    await fireEvent.press(screen.getByText("Confirmar leitura"));
    await waitFor(async () => {
      const outbox = await listOutbox(runtime.db);
      expect(outbox).toHaveLength(1);
      expect(outbox[0]).toMatchObject({ name: "rental.checkin", payload: { rentalId: seed.rentalId, inspection: { id, hourMeter: 4900, meterJumpConfirmed: true } } });
    });
  });
});
