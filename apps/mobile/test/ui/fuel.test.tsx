import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { UserDTO } from "@agrorende/contracts";
import { FuelLogCreatePayloadSchema } from "@agrorende/contracts/mutations";
import type * as MockRN from "react-native";

import { authStore } from "../../src/auth/session";
import { upsertMirrorRow } from "../../src/db/mirror";
import { AssetDetailScreen } from "../../src/features/assets/AssetDetailScreen";
import { FuelNewScreen } from "../../src/features/fuel";
import { setServices } from "../../src/lib/services";
import { listOutbox } from "../../src/sync/outbox";
import { setSyncRuntime } from "../../src/sync/runtime";
import { createTestRuntime, testId, USER_ID } from "../helpers/runtime";

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({}), Stack: { Screen: () => null } }));
jest.mock("expo-haptics", () => ({ notificationAsync: jest.fn(async () => undefined), impactAsync: jest.fn(async () => undefined), selectionAsync: jest.fn(async () => undefined), NotificationFeedbackType: {}, ImpactFeedbackStyle: {} }));
jest.mock("../../src/features/assets/ScanView", () => ({ ScanView: () => null }));
jest.mock("expo-location", () => ({ getCurrentPositionAsync: jest.fn(), requestForegroundPermissionsAsync: jest.fn(async () => ({ status: "denied" })) }));
jest.mock("../../src/components/AssetPicker", () => ({ AssetPicker: () => null }));
jest.mock("../../src/components/MapPreview", () => ({ MapPreview: () => null }));

const mockCostsRollup = jest.fn();
jest.mock("../../src/lib/app/session", () => ({ getApiClient: () => ({ costsRollup: mockCostsRollup }) }));

jest.mock("../../src/components/MediaCapture", () => {
  const { Pressable, Text } = jest.requireActual<typeof MockRN>("react-native");
  type MockProps = { parent: { type: string; id: string }; allowedTags: readonly string[]; value?: readonly Record<string, unknown>[]; onChange: (drafts: readonly Record<string, unknown>[]) => void };
  return {
    Thumbnails: () => null,
    MediaCapture: ({ parent, allowedTags, value, onChange }: MockProps) => (
      <Pressable testID="mock-capture" onPress={() => onChange([...(value ?? []), { id: "01900000-0000-7000-9000-000000000001", kind: "PHOTO", tag: allowedTags[0], mimeType: "image/jpeg", capturedAt: "2026-03-01T12:00:00.000Z", parent, localUri: "file:///docs/p.jpg" }])}>
        <Text>capture</Text>
      </Pressable>
    ),
  };
});

const NOW_MS = Date.parse("2026-03-01T12:00:00.000Z");
const ISO = "2026-03-01T00:00:00.000Z";

async function setup() {
  const test = await createTestRuntime();
  setSyncRuntime(test.runtime);
  test.runtime.store.setState({ network: "offline" });
  setServices({ db: test.runtime.db, userId: USER_ID, now: () => NOW_MS, newId: testId });
  const assetId = testId();
  await upsertMirrorRow(test.runtime.db, "assets", { id: assetId, organizationId: "org", syncVersion: 1, createdAt: ISO, updatedAt: ISO, deletedAt: null, code: "TR-1", name: "Trator 1", category: "TRACTOR", condition: "OPERATIONAL", currentRentalId: null }, 0);
  return { ...test, assetId };
}

function signIn(role: "FIELD" | "MANAGER") {
  authStore.setState({ status: "signedIn", user: { id: USER_ID, name: "Agente", role } as unknown as UserDTO });
}

beforeEach(() => {
  mockCostsRollup.mockReset();
  mockRouter.replace.mockReset();
});

describe("fuel log form", () => {
  test("validates, then saves offline and queues one fuelLog.create the server accepts", async () => {
    const { runtime, assetId } = await setup();
    signIn("FIELD");
    await render(<FuelNewScreen assetId={assetId} />);
    await fireEvent.press(await screen.findByTestId("fuel-save"));
    expect(await screen.findByText("Informe quantos litros foram colocados.")).toBeTruthy();
    expect(await listOutbox(runtime.db)).toHaveLength(0);

    await fireEvent.changeText(screen.getByTestId("fuel-liters"), "120");
    await fireEvent.press(screen.getByTestId("mock-capture"));
    await fireEvent.press(screen.getByTestId("fuel-save"));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith(`/assets/${assetId}`));
    const outbox = await listOutbox(runtime.db);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ name: "fuelLog.create", entityType: "FUEL_LOG" });
    expect(FuelLogCreatePayloadSchema.safeParse(outbox[0]?.payload).success).toBe(true);
    expect(outbox[0]?.payload).toMatchObject({ assetId, liters: 120, media: [expect.objectContaining({ tag: "FUEL_PUMP" })] });
  });
});

describe("asset profile fuel and costs", () => {
  test("a field user sees fuel history and consumption but never the cost card", async () => {
    const { runtime, assetId } = await setup();
    signIn("FIELD");
    const base = { organizationId: "org", syncVersion: 1, createdAt: ISO, updatedAt: ISO, deletedAt: null, assetId, pricePerLiterCents: null, totalCents: null, odometerKm: null, siteId: null, plotId: null, seasonId: null, operatorId: USER_ID, lat: null, lng: null, notes: null };
    await upsertMirrorRow(runtime.db, "fuelLogs", { ...base, id: testId(), liters: 100, hourMeter: 100, filledAt: "2026-02-01T10:00:00.000Z" }, 0);
    await upsertMirrorRow(runtime.db, "fuelLogs", { ...base, id: testId(), liters: 80, hourMeter: 110, filledAt: "2026-02-05T10:00:00.000Z" }, 0);
    await render(<AssetDetailScreen id={assetId} />);
    expect(await screen.findByText("Consumo: 8 L/h em 10 h")).toBeTruthy();
    expect(screen.getByText("80 L")).toBeTruthy();
    expect(screen.queryByTestId("asset-costs")).toBeNull();
    expect(mockCostsRollup).not.toHaveBeenCalled();
  });

  test("a manager sees the cost summary from the roll-up", async () => {
    const { assetId } = await setup();
    signIn("MANAGER");
    mockCostsRollup.mockResolvedValue({ groupBy: "asset", rows: [{ key: assetId, label: "Trator 1", laborCents: 10000, partsCents: 5000, externalCents: 2000, fuelCents: 74280, rentInCostCents: 0, totalCostCents: 91280, rentalRevenueCents: 0 }], totals: {} });
    await render(<AssetDetailScreen id={assetId} />);
    expect(await screen.findByTestId("asset-costs")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("asset-costs-total")).toBeTruthy());
    expect(mockCostsRollup).toHaveBeenCalledWith({ groupBy: "asset", assetId });
    expect(screen.getByTestId("asset-costs-fuelCents").props.children).toContain("742,80");
    expect(screen.getByText("Registre o horímetro duas vezes para ver litros por hora.")).toBeTruthy();
  });

  test("an offline manager gets a retry instead of a dead end", async () => {
    const { assetId } = await setup();
    signIn("MANAGER");
    mockCostsRollup.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ rows: [] });
    await render(<AssetDetailScreen id={assetId} />);
    await fireEvent.press(await screen.findByTestId("asset-costs-retry"));
    expect(await screen.findByTestId("asset-costs-empty")).toBeTruthy();
    expect(mockCostsRollup).toHaveBeenCalledTimes(2);
  });
});
