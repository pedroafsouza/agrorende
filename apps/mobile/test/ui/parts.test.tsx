import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { deleteMirrorRow, getMirrorRow, upsertMirrorRow } from "../../src/db/mirror";
import { JobPartsScreen } from "../../src/features/jobs/parts";
import { setServices } from "../../src/lib/services";
import { recordConflict } from "../../src/sync/conflicts";
import { addPart } from "../../src/sync/mutators/jobs";
import { listOutbox } from "../../src/sync/outbox";
import { setSyncRuntime } from "../../src/sync/runtime";
import { createTestRuntime, testId, USER_ID } from "../helpers/runtime";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }) }));
jest.mock("expo-haptics", () => ({ notificationAsync: jest.fn(async () => undefined), impactAsync: jest.fn(async () => undefined), selectionAsync: jest.fn(async () => undefined), NotificationFeedbackType: {}, ImpactFeedbackStyle: {} }));

const NOW = Date.parse("2026-03-02T12:00:00.000Z");
const ISO = new Date(NOW).toISOString();
const base = { organizationId: "org", syncVersion: 1, createdAt: ISO, updatedAt: ISO, deletedAt: null };

async function setup() {
  const { runtime } = await createTestRuntime();
  setSyncRuntime(runtime);
  const ids = { wo: testId(), filter: testId(), hose: testId(), van: testId(), level: testId() };
  await upsertMirrorRow(runtime.db, "workOrders", { ...base, id: ids.wo, number: "OS-7", type: "CORRECTIVE", status: "IN_PROGRESS", priority: "HIGH", title: "Troca", assigneeId: USER_ID, previousAssigneeIds: [], checklistSnapshot: [], checklistResponses: [] }, 0);
  await upsertMirrorRow(runtime.db, "parts", { ...base, id: ids.filter, sku: "FO-200", name: "Filtro de óleo", unit: "un", unitCostCents: 4_500, compatibleCategories: [], minStock: 1, isActive: true, archivedAt: null }, 0);
  await upsertMirrorRow(runtime.db, "parts", { ...base, id: ids.hose, sku: "MH-1", name: "Mangueira hidráulica", unit: "m", unitCostCents: null, compatibleCategories: [], minStock: 0, isActive: true, archivedAt: null }, 0);
  await upsertMirrorRow(runtime.db, "stockLocations", { ...base, id: ids.van, name: "Viatura Carlos", type: "VAN", userId: USER_ID, siteId: null }, 0);
  await upsertMirrorRow(runtime.db, "stockLevels", { ...base, id: ids.level, partId: ids.filter, stockLocationId: ids.van, quantity: 3 }, 0);
  let n = 0;
  setServices({ db: runtime.db, userId: USER_ID, now: () => NOW, newId: () => `01900000-0000-7000-8000-${String(++n).padStart(12, "0")}` });
  return { runtime, ids };
}

describe("Job parts (WO-09 P1)", () => {
  test("picks a part from the van, queues a catalog line and lowers the van stock", async () => {
    const { runtime, ids } = await setup();
    await render(<JobPartsScreen id={ids.wo} />);
    fireEvent.press(await screen.findByTestId("job-parts-add"));
    expect(await screen.findByText("Sua viatura: Viatura Carlos")).toBeTruthy();
    expect(screen.getByText("3 na sua viatura")).toBeTruthy();
    expect(screen.getByText("Não está na sua viatura")).toBeTruthy();
    fireEvent.changeText(screen.getByTestId("job-part-search"), "filtro");
    await waitFor(() => expect(screen.queryByTestId(`job-part-pick-${ids.hose}`)).toBeNull());
    fireEvent.press(screen.getByTestId(`job-part-pick-${ids.filter}`));
    expect(await screen.findByText("Escolhida: Filtro de óleo")).toBeTruthy();
    fireEvent.press(screen.getByTestId("job-part-submit"));
    await waitFor(async () => expect((await listOutbox(runtime.db)).map((o) => o.name)).toEqual(["workOrder.addPart"]));
    const [row] = await listOutbox(runtime.db);
    expect(row?.payload).toMatchObject({ workOrderId: ids.wo, name: "Filtro de óleo", quantity: 1, unit: "un", unitCostCents: 4_500, partId: ids.filter, stockLocationId: ids.van, partNumber: "FO-200" });
    expect(await getMirrorRow(runtime.db, "stockLevels", ids.level)).toMatchObject({ quantity: 2 });
  });

  test("EC-WO-20: a part missing from the van opens the sheet, queues nothing and keeps the draft for free text", async () => {
    const { runtime, ids } = await setup();
    await render(<JobPartsScreen id={ids.wo} />);
    fireEvent.press(await screen.findByTestId("job-parts-add"));
    fireEvent.press(await screen.findByTestId(`job-part-pick-${ids.hose}`));
    fireEvent.press(await screen.findByTestId("job-part-submit"));
    expect(await screen.findByText("Peça não está na sua viatura")).toBeTruthy();
    expect(screen.getByTestId("part-stock-hold")).toBeTruthy();
    expect(screen.getByTestId("ask-office")).toBeTruthy();
    expect(await listOutbox(runtime.db)).toEqual([]);
    fireEvent.press(screen.getByTestId("part-stock-free-text"));
    expect(await screen.findByDisplayValue("Mangueira hidráulica")).toBeTruthy();
    fireEvent.press(screen.getByTestId("job-part-submit"));
    await waitFor(async () => expect((await listOutbox(runtime.db)).map((o) => o.name)).toEqual(["workOrder.addPart"]));
    const [row] = await listOutbox(runtime.db);
    expect(row?.payload).toMatchObject({ name: "Mangueira hidráulica", unit: "m" });
    expect((row?.payload as { partId?: string }).partId).toBeUndefined();
    expect(await getMirrorRow(runtime.db, "stockLevels", ids.level)).toMatchObject({ quantity: 3 });
  });

  test("EC-WO-20: On hold · waiting for parts puts the job on hold with the part in the note", async () => {
    const { runtime, ids } = await setup();
    await render(<JobPartsScreen id={ids.wo} />);
    fireEvent.press(await screen.findByTestId("job-parts-add"));
    fireEvent.press(await screen.findByTestId(`job-part-pick-${ids.hose}`));
    fireEvent.press(await screen.findByTestId("job-part-submit"));
    fireEvent.press(await screen.findByTestId("part-stock-hold"));
    await waitFor(async () => expect((await listOutbox(runtime.db)).map((o) => o.name)).toEqual(["workOrder.transition"]));
    const [row] = await listOutbox(runtime.db);
    expect(row?.payload).toMatchObject({ id: ids.wo, action: "hold", holdReason: "WAITING_PARTS", note: "Aguardando Mangueira hidráulica (1 m)" });
  });

  test("a line the server refused after sync shows a banner and can be saved as free text", async () => {
    const { runtime, ids } = await setup();
    const line = testId();
    await addPart({ id: line, workOrderId: ids.wo, name: "Filtro de óleo", quantity: 2, unit: "un", partId: ids.filter, stockLocationId: ids.van }, { runtime });
    const [rejected] = await listOutbox(runtime.db);
    if (rejected === undefined) throw new Error("no outbox row");
    await runtime.db.run("UPDATE outbox SET status = 'REJECTED' WHERE id = ?", [rejected.id]);
    await deleteMirrorRow(runtime.db, "workOrderParts", line);
    expect(await getMirrorRow(runtime.db, "stockLevels", ids.level)).toMatchObject({ quantity: 1 });
    await recordConflict(runtime.db, { id: testId(), row: rejected, code: "WO_PART_NOT_IN_VAN_STOCK", now: ISO });
    await render(<JobPartsScreen id={ids.wo} />);
    expect(await screen.findByText("Esta peça não estava na sua viatura quando a OS foi enviada")).toBeTruthy();
    fireEvent.press(screen.getByText("Escolher outro caminho"));
    expect(await screen.findByTestId("part-stock-rejected")).toBeTruthy();
    fireEvent.press(screen.getByTestId("part-stock-free-text"));
    await waitFor(async () => expect((await listOutbox(runtime.db)).map((o) => [o.name, o.status])).toEqual([["workOrder.addPart", "PENDING"]]));
    expect(await getMirrorRow(runtime.db, "stockLevels", ids.level)).toMatchObject({ quantity: 3 });
    await waitFor(() => expect(screen.queryByTestId("job-parts-rejected")).toBeNull());
  });
});
