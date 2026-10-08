import { render, screen } from "@testing-library/react-native";

import { upsertMirrorRow } from "../../src/db/mirror";
import { MyReportsScreen } from "../../src/features/reports/MyReportsScreen";
import { setServices } from "../../src/lib/services";
import { createTestRuntime, testId, USER_ID } from "../helpers/runtime";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }) }));
jest.mock("expo-haptics", () => ({ notificationAsync: jest.fn(), impactAsync: jest.fn(), selectionAsync: jest.fn(), NotificationFeedbackType: {}, ImpactFeedbackStyle: {} }));

const NOW = "2026-03-01T12:00:00.000Z";

describe("My reports", () => {
  test("shows the empty state with a way to start a report", async () => {
    const { runtime } = await createTestRuntime();
    setServices({ db: runtime.db, userId: USER_ID });
    await render(<MyReportsScreen />);
    expect(await screen.findByTestId("reports-empty")).toBeTruthy();
  });

  test("lists the user's reports with their status", async () => {
    const { runtime } = await createTestRuntime();
    const id = testId();
    await upsertMirrorRow(runtime.db, "fieldReports", { id, number: "RC-7", reporterId: USER_ID, title: "Vazamento", category: "LEAK", priority: "HIGH", status: "IN_REVIEW", createdAt: NOW, updatedAt: NOW, deletedAt: null }, 0);
    setServices({ db: runtime.db, userId: USER_ID });
    await render(<MyReportsScreen />);
    expect(await screen.findByTestId(`report-row-${id}`)).toBeTruthy();
    expect(screen.getByText("RC-7 · Vazamento")).toBeTruthy();
    expect(screen.getByText("Em análise")).toBeTruthy();
  });
});
