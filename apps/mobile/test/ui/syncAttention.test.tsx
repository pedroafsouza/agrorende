import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { authStore } from "../../src/auth/session";
import { TodayScreen } from "../../src/features/home/TodayScreen";
import { SyncCenterScreen } from "../../src/features/sync";
import { SettingsScreen } from "../../src/features/settings/SettingsScreen";
import { initI18n } from "../../src/i18n";
import { setServices } from "../../src/lib/services";
import { syncStore } from "../../src/sync/store";
import { createTestRuntime, USER_ID } from "../helpers/runtime";

const mockShareAsync = jest.fn(async () => undefined);
const mockWritten: string[] = [];

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }) }));
jest.mock("../../src/features/home/widgets", () => {
  const Empty = () => null;
  return { DutyCard: Empty, MyReportsCard: Empty, NextJobCard: Empty, QuickReportCard: Empty, RentalsTodayCard: Empty, SyncCard: Empty };
});
jest.mock("../../src/features/settings/PushMuteCard", () => ({ PushMuteCard: () => null }));
jest.mock("../../src/lib/app/session", () => ({ getApiClient: () => undefined }));
jest.mock("../../src/features/settings/account", () => ({ deleteAccount: jest.fn(), signOutHere: jest.fn() }));
jest.mock("expo-sharing", () => ({ isAvailableAsync: async () => true, shareAsync: (...args: unknown[]) => mockShareAsync(...(args as [])) }));
jest.mock("expo-file-system", () => ({
  Paths: { cache: "file:///cache" },
  File: class {
    readonly uri: string;
    readonly exists = false;
    constructor(dir: string, name: string) {
      this.uri = `${dir}/${name}`;
    }
    create(): void {}
    delete(): void {}
    write(content: string): void {
      mockWritten.push(content);
    }
  },
}));

const OLD = "2026-01-01T08:00:00.000Z";

async function seedPending(db: Awaited<ReturnType<typeof createTestRuntime>>["runtime"]["db"], count: number, createdAt = new Date().toISOString()): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await db.run(
      "INSERT INTO outbox (id, name, entityType, entityId, payload, occurredAt, status, attempts, createdAt) VALUES (?, 'user.setDuty', 'USER', ?, '{}', ?, 'PENDING', 0, ?)",
      [`01900000-0000-7000-8000-00000000010${index}`, USER_ID, createdAt, createdAt],
    );
  }
}

beforeEach(() => {
  initI18n("en");
  mockShareAsync.mockClear();
  mockWritten.length = 0;
});

afterEach(() => {
  authStore.setState({ status: "signedOut", needsReauth: false }, true);
  syncStore.setState({ locationTrimmed: 0, lastSyncAt: undefined });
});

afterAll(() => {
  initI18n("pt-BR");
});

describe("sync attention on screens (change request T12-002)", () => {
  test("the reauthentication banner counts the items waiting to send (C6)", async () => {
    const { runtime } = await createTestRuntime();
    await seedPending(runtime.db, 2);
    setServices({ db: runtime.db, userId: USER_ID });
    authStore.setState({ status: "signedIn", needsReauth: true });
    await render(<TodayScreen />);
    expect(await screen.findByText("2 items are waiting to send. Nothing will be deleted.")).toBeTruthy();
  });

  test("Home shows the stale-device banner and Sync Center the trimmed-location banner", async () => {
    const { runtime } = await createTestRuntime();
    await seedPending(runtime.db, 1, OLD);
    setServices({ db: runtime.db, userId: USER_ID, syncNow: jest.fn(async () => undefined) });
    syncStore.setState({ lastSyncAt: OLD, locationTrimmed: 12 });
    authStore.setState({ status: "signedIn", needsReauth: false });
    await render(<TodayScreen />);
    expect(await screen.findByTestId("error-banner-DEVICE_UNSYNCED_STALE")).toBeTruthy();
    expect(screen.getByTestId("error-banner-LOCATION_BUFFER_TRIMMED")).toBeTruthy();

    await render(<SyncCenterScreen />);
    expect(await screen.findByTestId("error-banner-LOCATION_BUFFER_TRIMMED")).toBeTruthy();
    expect(screen.getByText("Many locations saved")).toBeTruthy();
  });

  test("Settings → Account sends now with mobile data once and saves a copy of the pending work", async () => {
    const { runtime } = await createTestRuntime();
    await seedPending(runtime.db, 1);
    await runtime.db.run(
      "INSERT INTO media_files (mediaId, localUri, mimeType, kind, state, wifiOnly, attempts, bytesSent) VALUES ('m1', 'file:///media/m1.mp4', 'video/mp4', 'VIDEO', 'QUEUED', 1, 0, 0)",
    );
    const syncNow = jest.fn(async () => undefined);
    setServices({ db: runtime.db, userId: USER_ID, syncNow });
    authStore.setState({ status: "signedIn", needsReauth: false });
    await render(<SettingsScreen />);
    expect(await screen.findByText("2 items waiting to send")).toBeTruthy();

    fireEvent.press(screen.getByTestId("settings-send-now"));
    await waitFor(() => expect(syncNow).toHaveBeenCalled());
    expect(await runtime.db.get<{ wifiOnly: number }>("SELECT wifiOnly FROM media_files WHERE mediaId = 'm1'")).toEqual({ wifiOnly: 0 });

    fireEvent.press(screen.getByTestId("settings-save-copy"));
    await waitFor(() => expect(mockShareAsync).toHaveBeenCalled());
    const manifest = JSON.parse(mockWritten[0] ?? "{}") as { outbox: unknown[]; files: string[]; userId: string };
    expect(manifest.userId).toBe(USER_ID);
    expect(manifest.outbox).toHaveLength(1);
    expect(manifest.files).toContain("file:///media/m1.mp4");
  });
});
