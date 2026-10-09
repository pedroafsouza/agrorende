import { render, screen } from "@testing-library/react-native";

import { upsertMirrorRow } from "../../src/db/mirror";
import { MoreScreen } from "../../src/features/settings/MoreScreen";
import { setServices } from "../../src/lib/services";
import { registeredMutator } from "../../src/sync/mutator";
import "../../src/sync/mutators";
import { setSyncRuntime } from "../../src/sync/runtime";
import { createTestRuntime, testId, USER_ID } from "../helpers/runtime";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }), useLocalSearchParams: () => ({}) }));
jest.mock("expo-haptics", () => ({ notificationAsync: jest.fn(async () => undefined), impactAsync: jest.fn(async () => undefined), selectionAsync: jest.fn(async () => undefined), NotificationFeedbackType: {}, ImpactFeedbackStyle: {} }));

const NOW = "2026-03-01T12:00:00.000Z";

describe("More screen (change request T17-003)", () => {
  afterEach(() => setSyncRuntime(undefined));

  test("shows the unread notification count on the Notifications entry", async () => {
    const { runtime } = await createTestRuntime();
    setSyncRuntime(runtime);
    for (const readAt of [null, null, NOW]) {
      await upsertMirrorRow(
        runtime.db,
        "notifications",
        { id: testId(), organizationId: "o", syncVersion: 1, createdAt: NOW, updatedAt: NOW, deletedAt: null, userId: USER_ID, type: "WO_ASSIGNED", title: "Nova OS", body: "Corpo", entityType: "WORK_ORDER", entityId: testId(), readAt, pushedAt: null },
        0,
      );
    }
    setServices({ db: runtime.db, userId: USER_ID });
    await render(<MoreScreen />);
    expect(await screen.findByText("2 não lidas")).toBeTruthy();
  });

  test("shows no badge when everything is read", async () => {
    const { runtime } = await createTestRuntime();
    setSyncRuntime(runtime);
    setServices({ db: runtime.db, userId: USER_ID });
    await render(<MoreScreen />);
    expect(await screen.findByTestId("more-notifications")).toBeTruthy();
    expect(screen.queryByText(/não lida/)).toBeNull();
  });
});

describe("mutator barrel (change requests T15-002 and T17-002)", () => {
  test("registers the fuel and comment mutators for a scope-reset rebase", () => {
    expect(registeredMutator("fuelLog.create")).toBeDefined();
    expect(registeredMutator("comment.create")).toBeDefined();
  });
});
