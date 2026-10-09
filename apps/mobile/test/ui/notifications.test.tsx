import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { upsertMirrorRow } from "../../src/db/mirror";
import { countUnreadNotifications, handlePushTap, NotificationsScreen, parsePushData, registerPushForActiveUser, routeForNotification } from "../../src/features/notifications";
import { setServices } from "../../src/lib/services";
import { listOutbox } from "../../src/sync/outbox";
import { setSyncRuntime } from "../../src/sync/runtime";
import { createTestRuntime, testId, USER_ID } from "../helpers/runtime";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }), useLocalSearchParams: () => ({}) }));
jest.mock("expo-haptics", () => ({ notificationAsync: jest.fn(async () => undefined), impactAsync: jest.fn(async () => undefined), selectionAsync: jest.fn(async () => undefined), NotificationFeedbackType: {}, ImpactFeedbackStyle: {} }));

const NOW = "2026-03-01T12:00:00.000Z";

async function seedNotification(db: Parameters<typeof upsertMirrorRow>[0], fields: { id?: string; userId?: string; entityType?: string; entityId?: string; title: string; readAt?: string | null; createdAt?: string }) {
  const id = fields.id ?? testId();
  await upsertMirrorRow(
    db,
    "notifications",
    { id, organizationId: "o", syncVersion: 1, createdAt: fields.createdAt ?? NOW, updatedAt: NOW, deletedAt: null, userId: fields.userId ?? USER_ID, type: "WO_ASSIGNED", title: fields.title, body: "Corpo", entityType: fields.entityType ?? "WORK_ORDER", entityId: fields.entityId ?? testId(), readAt: fields.readAt ?? null, pushedAt: null },
    0,
  );
  return id;
}

describe("notification centre (PLT-08)", () => {
  beforeEach(() => mockPush.mockClear());
  afterEach(() => setSyncRuntime(undefined));

  test("maps entity types to the deep links of A§13.5", () => {
    expect(routeForNotification("FIELD_REPORT", "r1")).toBe("/reports/r1");
    expect(routeForNotification("WORK_ORDER", "w1")).toBe("/jobs/w1");
    expect(routeForNotification("RENTAL", "n1")).toBe("/rentals/n1");
    expect(routeForNotification("ASSET", "a1")).toBe("/assets/a1");
    expect(routeForNotification("INVOICE", "i1")).toBeUndefined();
    expect(routeForNotification("WORK_ORDER", null)).toBeUndefined();
    expect(parsePushData({ notificationId: "n", entityType: "RENTAL", entityId: "x" })).toEqual({ notificationId: "n", route: "/rentals/x" });
    expect(parsePushData("junk")).toEqual({});
  });

  test("shows the empty state", async () => {
    const { runtime } = await createTestRuntime();
    setServices({ db: runtime.db, userId: USER_ID });
    await render(<NotificationsScreen />);
    expect(await screen.findByTestId("notifications-empty")).toBeTruthy();
  });

  test("tapping an unread notification marks it read, lowers the count and opens the job", async () => {
    const { runtime } = await createTestRuntime();
    setSyncRuntime(runtime);
    const jobId = testId();
    const first = await seedNotification(runtime.db, { title: "Novo serviço", entityId: jobId });
    await seedNotification(runtime.db, { title: "Relato aprovado", entityType: "FIELD_REPORT", createdAt: "2026-03-01T11:00:00.000Z" });
    await seedNotification(runtime.db, { title: "De outra pessoa", userId: testId() });
    setServices({ db: runtime.db, userId: USER_ID });
    expect(await countUnreadNotifications(runtime.db, USER_ID)).toBe(2);

    await render(<NotificationsScreen />);
    expect(await screen.findByText("2 não lidas")).toBeTruthy();
    expect(screen.queryByText("De outra pessoa")).toBeNull();

    await fireEvent.press(screen.getByTestId(`notification-${first}`));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(`/jobs/${jobId}`));
    expect(await screen.findByText("1 não lida")).toBeTruthy();
    expect(await countUnreadNotifications(runtime.db, USER_ID)).toBe(1);
    expect((await listOutbox(runtime.db)).some((row) => row.name === "notification.markRead")).toBe(true);

    await fireEvent.press(screen.getByTestId("notifications-mark-all"));
    expect(await screen.findByText("Nenhuma não lida")).toBeTruthy();
    expect(await countUnreadNotifications(runtime.db, USER_ID)).toBe(0);
  });

  test("a push tap marks the active user's notification read and ignores another user's", async () => {
    const { runtime } = await createTestRuntime();
    setSyncRuntime(runtime);
    const reportId = testId();
    const mine = await seedNotification(runtime.db, { title: "Meu", entityType: "FIELD_REPORT", entityId: reportId });
    const route = await handlePushTap(runtime.db, USER_ID, { notificationId: mine, type: "REPORT_APPROVED", entityType: "FIELD_REPORT", entityId: reportId });
    expect(route).toBe(`/reports/${reportId}`);
    expect(await countUnreadNotifications(runtime.db, USER_ID)).toBe(0);

    const before = (await listOutbox(runtime.db)).length;
    await handlePushTap(runtime.db, USER_ID, { notificationId: testId(), entityType: "WORK_ORDER", entityId: testId() });
    expect((await listOutbox(runtime.db)).length).toBe(before);
  });

  test("registers the installation for the active user, with a token only when push is allowed", async () => {
    const device = { deviceId: "dev", platform: "ANDROID" as const, model: "Pixel", osVersion: "15", appVersion: "1.1.0", runtimeVersion: "1" };
    const register = jest.fn(async () => undefined);
    expect(await registerPushForActiveUser({ permissionGranted: async () => true, pushToken: async () => "ExponentPushToken[x]", register, device })).toBe("registered");
    expect(register).toHaveBeenLastCalledWith({ ...device, pushToken: "ExponentPushToken[x]" });
    expect(await registerPushForActiveUser({ permissionGranted: async () => false, pushToken: async () => "never", register, device })).toBe("noPermission");
    expect(register).toHaveBeenLastCalledWith(device);
  });
});
