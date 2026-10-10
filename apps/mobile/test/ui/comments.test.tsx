import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { upsertMirrorRow } from "../../src/db/mirror";
import { CommentThread, commentDraftError } from "../../src/features/comments";
import { setServices } from "../../src/lib/services";
import { listOutbox } from "../../src/sync/outbox";
import { setSyncRuntime } from "../../src/sync/runtime";
import { createTestRuntime, testId, USER_ID } from "../helpers/runtime";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }), useLocalSearchParams: () => ({}) }));
jest.mock("expo-haptics", () => ({ notificationAsync: jest.fn(async () => undefined), impactAsync: jest.fn(async () => undefined), selectionAsync: jest.fn(async () => undefined), NotificationFeedbackType: {}, ImpactFeedbackStyle: {} }));

const NOW = "2026-03-01T12:00:00.000Z";

describe("CommentThread (PLT-10)", () => {
  afterEach(() => setSyncRuntime(undefined));

  test("validates the draft", () => {
    expect(commentDraftError("   ")).toBe("comments.required");
    expect(commentDraftError("x".repeat(4001))).toBe("comments.tooLong");
    expect(commentDraftError("ok")).toBeUndefined();
  });

  test("shows the empty state, then queues a comment offline and marks it waiting to send", async () => {
    const { runtime } = await createTestRuntime();
    setSyncRuntime(runtime);
    setServices({ db: runtime.db, userId: USER_ID });
    const reportId = testId();
    await render(<CommentThread entityType="FIELD_REPORT" entityId={reportId} />);
    expect(await screen.findByTestId("comments-empty")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("comment-send"));
    expect(await screen.findByText("Escreva algo antes de enviar.")).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId("comment-input"), "  Trocar a correia amanhã  ");
    await fireEvent.press(screen.getByTestId("comment-send"));
    expect(await screen.findByText("Trocar a correia amanhã")).toBeTruthy();
    expect(screen.getByText("Salvo no celular")).toBeTruthy();
    expect(screen.getByText("Você")).toBeTruthy();

    const outbox = await listOutbox(runtime.db);
    const entry = outbox.find((row) => row.name === "comment.create");
    expect(entry).toBeDefined();
    expect(entry?.payload).toMatchObject({ entityType: "FIELD_REPORT", entityId: reportId, body: "Trocar a correia amanhã" });
  });

  test("lists synced comments oldest first with the author's name", async () => {
    const { runtime } = await createTestRuntime();
    setSyncRuntime(runtime);
    const jobId = testId();
    const authorId = testId();
    await upsertMirrorRow(runtime.db, "users", { id: authorId, organizationId: "o", syncVersion: 1, createdAt: NOW, updatedAt: NOW, deletedAt: null, name: "Ana Gestora" }, 0);
    await upsertMirrorRow(runtime.db, "comments", { id: testId(), organizationId: "o", syncVersion: 2, createdAt: "2026-03-01T10:00:00.000Z", updatedAt: NOW, deletedAt: null, entityType: "WORK_ORDER", entityId: jobId, authorId, body: "Primeiro" }, 0);
    await upsertMirrorRow(runtime.db, "comments", { id: testId(), organizationId: "o", syncVersion: 3, createdAt: "2026-03-01T11:00:00.000Z", updatedAt: NOW, deletedAt: null, entityType: "WORK_ORDER", entityId: jobId, authorId, body: "Segundo" }, 0);
    setServices({ db: runtime.db, userId: USER_ID });
    await render(<CommentThread entityType="WORK_ORDER" entityId={jobId} />);
    expect(await screen.findByText("Primeiro")).toBeTruthy();
    expect(screen.getAllByText("Ana Gestora")).toHaveLength(2);
    expect(screen.queryByText("Salvo no celular")).toBeNull();
    const bodies = screen.getAllByText(/Primeiro|Segundo/).map((node) => node.props.children);
    expect(bodies).toEqual(["Primeiro", "Segundo"]);
    await waitFor(() => expect(screen.queryByTestId("comments-empty")).toBeNull());
  });
});
