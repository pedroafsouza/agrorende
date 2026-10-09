import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { upsertMirrorRow } from "../../src/db/mirror";
import { JobDetailScreen } from "../../src/features/jobs/JobDetailScreen";
import { JobsScreen } from "../../src/features/jobs/JobsScreen";
import { resetArrivalMemory } from "../../src/features/jobs/useArrivalPrompt";
import { setServices } from "../../src/lib/services";
import { listOutbox } from "../../src/sync/outbox";
import { setSyncRuntime } from "../../src/sync/runtime";
import { createTestRuntime, testId, USER_ID } from "../helpers/runtime";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }) }));
jest.mock("../../src/components/MediaCapture", () => ({ Thumbnails: () => null, MediaCapture: () => null }));
jest.mock("expo-haptics", () => ({ notificationAsync: jest.fn(async () => undefined), impactAsync: jest.fn(async () => undefined), selectionAsync: jest.fn(async () => undefined), NotificationFeedbackType: {}, ImpactFeedbackStyle: {} }));
jest.mock("react-native-maps", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: ({ children }: { children?: unknown }) => <View testID="native-map">{children as never}</View>, Marker: ({ testID }: { testID?: string }) => <View testID={testID} /> };
});
jest.mock("../../src/features/jobs/loadJobsMap", () => ({ loadJobsMap: async () => jest.requireActual("../../src/features/jobs/JobsMap") }));
jest.mock("../../src/location/watch", () => ({
  watchForegroundFix: jest.fn(async (onFix: (fix: { lat: number; lng: number; accuracyM: number }) => void) => {
    setTimeout(() => onFix({ lat: -15.6005, lng: -56.1, accuracyM: 12 }), 0);
    return () => undefined;
  }),
}));

const ISO = "2026-03-02T12:00:00.000Z";

async function seed(status = "EN_ROUTE") {
  const { runtime } = await createTestRuntime();
  const id = testId();
  const siteId = testId();
  const assetId = testId();
  await upsertMirrorRow(runtime.db, "sites", { id: siteId, organizationId: "org", syncVersion: 1, name: "Fazenda Boa Vista", lat: -15.6, lng: -56.1, radiusM: 200, createdAt: ISO, updatedAt: ISO, deletedAt: null }, 0);
  await upsertMirrorRow(
    runtime.db,
    "workOrders",
    { id, organizationId: "org", syncVersion: 1, number: "OS-7", title: "Vazamento", status, priority: "CRITICAL", assigneeId: USER_ID, siteId, assetId, previousAssigneeIds: [], checklistSnapshot: [], checklistResponses: [], createdAt: ISO, updatedAt: ISO, deletedAt: null },
    0,
  );
  setServices({ db: runtime.db, userId: USER_ID, now: () => Date.parse(ISO) });
  setSyncRuntime(runtime);
  return { runtime, id, siteId, assetId };
}

describe("jobs P1", () => {
  beforeEach(() => {
    resetArrivalMemory();
    mockPush.mockClear();
  });
  afterEach(() => setSyncRuntime(undefined));

  test("arrival prompt asks, and 'Not here yet' changes nothing", async () => {
    const { runtime, id } = await seed();
    await render(<JobDetailScreen id={id} />);
    expect(await screen.findByText("Chegou em Fazenda Boa Vista?")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("job-arrival-not-yet"));
    expect(await listOutbox(runtime.db)).toHaveLength(0);
  });

  test("'I'm here' sends the arrive transition only after the tap", async () => {
    const { runtime, id } = await seed();
    await render(<JobDetailScreen id={id} />);
    await fireEvent.press(await screen.findByTestId("job-arrival-confirm"));
    await waitFor(async () => expect((await listOutbox(runtime.db)).map((row) => [row.name, (row.payload as { action: string }).action])).toEqual([["workOrder.transition", "arrive"]]));
  });

  test("'Wrong place' sends the point to the office as a comment", async () => {
    const { runtime, id } = await seed();
    await render(<JobDetailScreen id={id} />);
    await fireEvent.press(await screen.findByTestId("job-arrival-wrong-place"));
    await waitFor(async () => {
      const outbox = await listOutbox(runtime.db);
      expect(outbox.map((row) => row.name)).toEqual(["comment.create"]);
      expect((outbox[0]?.payload as { body: string }).body).toContain("-15.600500, -56.100000");
    });
  });

  test("While I'm here opens a report prefilled with the machine and the site", async () => {
    const { id, siteId, assetId } = await seed("IN_PROGRESS");
    await render(<JobDetailScreen id={id} />);
    await fireEvent.press(await screen.findByTestId("job-while-here"));
    expect(mockPush).toHaveBeenCalledWith(`/reports/new?assetId=${assetId}&siteId=${siteId}`);
  });

  test("the jobs map shows a pin per job and the urgency legend", async () => {
    const { id } = await seed("ACCEPTED");
    await render(<JobsScreen />);
    await fireEvent.press(await screen.findByText("Mapa"));
    expect(await screen.findByTestId(`jobs-pin-${id}`)).toBeTruthy();
    expect(screen.getByText("A cor do alfinete mostra a urgência.")).toBeTruthy();
  });
});
