import { render, screen } from "@testing-library/react-native";

import { CommentThread } from "../../src/features/comments";
import { JobPartsScreen } from "../../src/features/jobs/parts";
import { setServices } from "../../src/lib/services";
import { setSyncRuntime } from "../../src/sync/runtime";
import { createTestRuntime, USER_ID } from "../helpers/runtime";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }), useLocalSearchParams: () => ({}), Stack: { Screen: () => null } }));
jest.mock("../../src/components/MediaCapture", () => ({ Thumbnails: () => null, MediaCapture: () => null }));
jest.mock("expo-haptics", () => ({ notificationAsync: jest.fn(async () => undefined), impactAsync: jest.fn(async () => undefined), selectionAsync: jest.fn(async () => undefined), NotificationFeedbackType: {}, ImpactFeedbackStyle: {} }));

const id = "00000000-0000-4000-8000-000000000001";

describe("wave 6 mount points", () => {
  afterEach(() => setSyncRuntime(undefined));

  it.each(["FIELD_REPORT", "WORK_ORDER", "RENTAL"] as const)("CommentThread mounts a thread for %s", async (entityType) => {
    const { runtime } = await createTestRuntime();
    setSyncRuntime(runtime);
    setServices({ db: runtime.db, userId: USER_ID });
    await render(<CommentThread entityType={entityType} entityId={id} />);
    expect(await screen.findByTestId("comments-empty")).toBeTruthy();
    expect(screen.getByTestId("comment-input")).toBeTruthy();
    expect(screen.getByTestId("comment-send")).toBeTruthy();
  });

  it("the parts screen lives in its own folder for the wave 6 owner", () => {
    expect(typeof JobPartsScreen).toBe("function");
  });
});
