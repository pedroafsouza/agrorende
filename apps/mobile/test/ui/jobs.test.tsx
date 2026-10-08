import { fireEvent, render, screen } from "@testing-library/react-native";

import { upsertMirrorRow } from "../../src/db/mirror";
import { JobDetailScreen } from "../../src/features/jobs/JobDetailScreen";
import { JobsScreen } from "../../src/features/jobs/JobsScreen";
import { NextJobCard } from "../../src/features/jobs/widgets";
import { setServices } from "../../src/lib/services";
import { setSyncRuntime } from "../../src/sync/runtime";
import { listOutbox } from "../../src/sync/outbox";
import { createTestRuntime, testId, USER_ID } from "../helpers/runtime";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }) }));
jest.mock("../../src/components/MediaCapture", () => ({ Thumbnails: () => null, MediaCapture: () => null }));
jest.mock("expo-haptics", () => ({ notificationAsync: jest.fn(async () => undefined), impactAsync: jest.fn(async () => undefined), selectionAsync: jest.fn(async () => undefined), NotificationFeedbackType: {}, ImpactFeedbackStyle: {} }));

const NOW = Date.parse("2026-03-02T12:00:00.000Z");
const ISO = new Date(NOW).toISOString();

function wo(id: string, extra: Record<string, unknown> = {}) {
  return { id, organizationId: "org", syncVersion: 1, number: "OS-7", title: "Vazamento", status: "ASSIGNED", priority: "HIGH", assigneeId: USER_ID, previousAssigneeIds: [], checklistSnapshot: [], checklistResponses: [], createdAt: ISO, updatedAt: ISO, deletedAt: null, ...extra };
}

describe("Jobs tab", () => {
  test("empty Today shows a calm empty state", async () => {
    const { runtime } = await createTestRuntime();
    setServices({ db: runtime.db, userId: USER_ID, now: () => NOW });
    await render(<JobsScreen />);
    expect(await screen.findByTestId("jobs-today")).toBeTruthy();
    expect(screen.getByText("Nada para hoje")).toBeTruthy();
  });

  test("lists today's job with its status and the home card points to it", async () => {
    const { runtime } = await createTestRuntime();
    const id = testId();
    await upsertMirrorRow(runtime.db, "workOrders", wo(id), 0);
    setServices({ db: runtime.db, userId: USER_ID, now: () => NOW });
    await render(<JobsScreen />);
    expect(await screen.findByTestId(`job-row-${id}`)).toBeTruthy();
    expect(screen.getByText("OS-7 · Vazamento")).toBeTruthy();
    expect(screen.getAllByText("Atribuído").length).toBeGreaterThan(0);
    await render(<NextJobCard />);
    expect(await screen.findByTestId("home-next-job-open")).toBeTruthy();
  });
});

describe("Job detail", () => {
  test("Accept is the one primary action and queues a transition", async () => {
    const { runtime } = await createTestRuntime();
    setSyncRuntime(runtime);
    const id = testId();
    await upsertMirrorRow(runtime.db, "workOrders", wo(id), 0);
    setServices({ db: runtime.db, userId: USER_ID, now: () => NOW });
    await render(<JobDetailScreen id={id} />);
    fireEvent.press(await screen.findByTestId("job-action-accept"));
    expect(screen.getByTestId("job-action-decline")).toBeTruthy();
    await screen.findByTestId("job-detail");
    await new Promise((resolve) => setTimeout(resolve, 50));
    const outbox = await listOutbox(runtime.db);
    expect(outbox.map((o) => o.name)).toEqual(["workOrder.transition"]);
  });

  test("EC-WO-09: a safety hold shows the stop banner and no resume", async () => {
    const { runtime } = await createTestRuntime();
    const id = testId();
    await upsertMirrorRow(runtime.db, "workOrders", wo(id, { status: "ON_HOLD", holdReason: "SAFETY" }), 0);
    setServices({ db: runtime.db, userId: USER_ID, now: () => NOW });
    await render(<JobDetailScreen id={id} />);
    expect(await screen.findByTestId("job-notice-WO_SAFETY_STOP_REQUIRED")).toBeTruthy();
    expect(screen.queryByTestId("job-action-resume")).toBeNull();
  });
});
