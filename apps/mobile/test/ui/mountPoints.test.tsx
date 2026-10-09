import { render } from "@testing-library/react-native";

import { CommentThread } from "../../src/features/comments";
import { JobPartsScreen } from "../../src/features/jobs/parts";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }), Stack: { Screen: () => null } }));
jest.mock("../../src/components/MediaCapture", () => ({ Thumbnails: () => null, MediaCapture: () => null }));
jest.mock("expo-haptics", () => ({ notificationAsync: jest.fn(async () => undefined), impactAsync: jest.fn(async () => undefined), selectionAsync: jest.fn(async () => undefined), NotificationFeedbackType: {}, ImpactFeedbackStyle: {} }));

const id = "00000000-0000-4000-8000-000000000001";

describe("wave 6 mount points", () => {
  it.each(["FIELD_REPORT", "WORK_ORDER", "RENTAL"] as const)("CommentThread renders nothing for %s", async (entityType) => {
    const screen = await render(<CommentThread entityType={entityType} entityId={id} />);
    expect(screen.toJSON()).toBeNull();
  });

  it("the parts screen lives in its own folder for the wave 6 owner", () => {
    expect(typeof JobPartsScreen).toBe("function");
  });
});
