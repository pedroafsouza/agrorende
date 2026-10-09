import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { upsertMirrorRow } from "../../src/db/mirror";
import { ReportDetailScreen } from "../../src/features/reports/ReportDetailScreen";
import { setServices } from "../../src/lib/services";
import { listOutbox } from "../../src/sync/outbox";
import { setSyncRuntime } from "../../src/sync/runtime";
import { createTestRuntime, testId, USER_ID } from "../helpers/runtime";

jest.mock("expo-router", () => ({ Stack: { Screen: () => null }, useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }), useLocalSearchParams: () => ({}) }));
jest.mock("expo-haptics", () => ({ notificationAsync: jest.fn(async () => undefined), impactAsync: jest.fn(async () => undefined), selectionAsync: jest.fn(async () => undefined), NotificationFeedbackType: {}, ImpactFeedbackStyle: {} }));

jest.mock("react-native-maps", () => ({ __esModule: true, default: () => null, Marker: () => null }));

jest.mock("../../src/components/MediaCapture/CameraSheet", () => ({ CameraSheet: () => null }));
jest.mock("../../src/components/MediaCapture/VoiceNoteButton", () => ({ VoiceNoteButton: () => null }));

jest.mock("expo-image", () => ({ Image: () => null }));

const NOW = "2026-03-01T12:00:00.000Z";

async function seed(status: string, reporterId = USER_ID) {
  const { runtime } = await createTestRuntime();
  const id = testId();
  await upsertMirrorRow(runtime.db, "fieldReports", { id, number: "RC-9", reporterId, title: "Mangueira", description: "", category: "LEAK", priority: "MEDIUM", status, machineOperable: true, createdAt: NOW, updatedAt: NOW, deletedAt: null }, 0);
  setServices({ db: runtime.db, userId: USER_ID });
  setSyncRuntime(runtime);
  return { runtime, id };
}

describe("FR-11 report edit", () => {
  afterEach(() => setSyncRuntime(undefined));

  test("the reporter edits a SUBMITTED report and the change is queued", async () => {
    const { runtime, id } = await seed("SUBMITTED");
    await render(<ReportDetailScreen id={id} />);
    await fireEvent.press(await screen.findByTestId("report-edit"));
    await fireEvent.changeText(screen.getByTestId("report-edit-title"), "Mangueira estourada");
    await fireEvent.press(screen.getByTestId("report-edit-save"));
    await waitFor(async () => {
      const outbox = await listOutbox(runtime.db);
      expect(outbox.map((row) => row.name)).toEqual(["fieldReport.update"]);
      expect(outbox[0]?.payload).toMatchObject({ id, patch: { title: "Mangueira estourada" } });
    });
  });

  test("no edit once the office picked the report up, or for someone else's report", async () => {
    const reviewed = await seed("IN_REVIEW");
    const first = await render(<ReportDetailScreen id={reviewed.id} />);
    expect(await screen.findByTestId("report-detail")).toBeTruthy();
    expect(screen.queryByTestId("report-edit")).toBeNull();
    await first.unmount();

    const other = await seed("SUBMITTED", testId());
    await render(<ReportDetailScreen id={other.id} />);
    expect(await screen.findByTestId("report-detail")).toBeTruthy();
    expect(screen.queryByTestId("report-edit")).toBeNull();
  });

  test("a rejected edit shows plain REPORT_LOCKED copy", async () => {
    const { runtime, id } = await seed("SUBMITTED");
    await render(<ReportDetailScreen id={id} />);
    await fireEvent.press(await screen.findByTestId("report-edit"));
    await fireEvent.changeText(screen.getByTestId("report-edit-title"), "Outro título");
    await fireEvent.press(screen.getByTestId("report-edit-save"));
    await waitFor(async () => expect(await listOutbox(runtime.db)).toHaveLength(1));
    await runtime.db.run("UPDATE outbox SET status = 'REJECTED', lastError = 'REPORT_LOCKED'");
    await upsertMirrorRow(runtime.db, "fieldReports", { id, number: "RC-9", reporterId: USER_ID, title: "Mangueira", category: "LEAK", priority: "MEDIUM", status: "IN_REVIEW", createdAt: NOW, updatedAt: NOW, deletedAt: null }, 0);
    await render(<ReportDetailScreen id={id} />);
    expect(await screen.findByTestId("report-edit-locked")).toBeTruthy();
    expect(screen.getByText("Sua alteração não foi salva")).toBeTruthy();
  });
});
