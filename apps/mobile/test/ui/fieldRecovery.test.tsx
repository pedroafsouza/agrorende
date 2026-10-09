import type { AppErrorCode } from "@agrorende/contracts/errors";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { PermissionPrompt } from "../../src/components/PermissionPrompt";
import { ReportWizardScreen } from "../../src/features/reports/ReportWizardScreen";
import { message } from "../../src/i18n/messages";
import { setLocale, type AppLocale } from "../../src/i18n/runtime";
import { saveDraft } from "../../src/lib/drafts";
import { setServices } from "../../src/lib/services";
import { listOutbox } from "../../src/sync/outbox";
import { setSyncRuntime } from "../../src/sync/runtime";
import { ErrorSheet } from "../../src/ui/recovery/ErrorSheet";
import { createTestRuntime, testId, USER_ID } from "../helpers/runtime";

jest.mock("expo-router", () => ({ Stack: { Screen: () => null }, useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }), useLocalSearchParams: () => ({}) }));
jest.mock("expo-haptics", () => ({ notificationAsync: jest.fn(async () => undefined), impactAsync: jest.fn(async () => undefined), selectionAsync: jest.fn(async () => undefined), NotificationFeedbackType: {}, ImpactFeedbackStyle: {} }));
jest.mock("react-native-maps", () => ({ __esModule: true, default: () => null, Marker: () => null }));
jest.mock("../../src/components/MediaCapture/CameraSheet", () => ({ CameraSheet: () => null }));
jest.mock("../../src/components/MediaCapture/VoiceNoteButton", () => ({ VoiceNoteButton: () => null }));
jest.mock("expo-location", () => ({ getCurrentPositionAsync: jest.fn(), requestForegroundPermissionsAsync: jest.fn(async () => ({ status: "denied" })) }));
jest.mock("../../src/components/AssetPicker", () => ({ AssetPicker: () => null }));
jest.mock("expo-image", () => ({ Image: () => null }));

/** The P0 field recovery codes T17.9–T17.12 cover, plus the arrival mismatch (EC-WO-21). */
const FIELD_CODES: readonly AppErrorCode[] = [
  "PERMISSION_MEDIA_BLOCKED",
  "PERMISSION_LOCATION_LIMITED",
  "DEVICE_STORAGE_FULL",
  "DEVICE_CLOCK_SKEWED",
  "SCAN_UNREADABLE",
  "PDF_SHARE_UNAVAILABLE",
  "REPORT_EVIDENCE_REQUIRED",
  "REPORT_DRAFT_RESTORED",
  "WO_SIGNATURE_EXCEPTION",
  "RENTAL_DRAFT_INTERRUPTED",
  "WO_ARRIVAL_PROMPT_MISMATCH",
];
const LOCALES: readonly AppLocale[] = ["pt-BR", "en", "en-XA"];

describe("field recovery copy and actions (component fallback for the Maestro flows)", () => {
  afterEach(() => {
    setLocale("pt-BR");
    setSyncRuntime(undefined);
  });

  test.each(LOCALES)("every field recovery sheet has translated copy and a way forward in %s", async (locale) => {
    setLocale(locale);
    for (const code of FIELD_CODES) {
      const title = message(`errors.${code}.title`);
      const body = message(`errors.${code}.body`);
      expect(title).not.toBe(`errors.${code}.title`);
      expect(body).not.toBe(`errors.${code}.body`);
      const view = await render(<ErrorSheet code={code} onClose={() => undefined} />);
      expect(screen.getByTestId(`error-sheet-${code}`)).toBeTruthy();
      expect(screen.getByText(title)).toBeTruthy();
      expect(screen.getByText(body)).toBeTruthy();
      // Close is always present; at least one recovery action must sit above it (no dead end).
      expect(screen.getAllByRole("button").length).toBeGreaterThan(1);
      await view.unmount();
    }
  });

  test("blocked camera offers settings and the gallery alternative", async () => {
    const onAlternate = jest.fn();
    await render(<PermissionPrompt kind="camera" state="blocked" onRequest={() => undefined} onAlternate={onAlternate} />);
    expect(screen.getByTestId("permission-camera-blocked")).toBeTruthy();
    expect(screen.getByTestId("permission-camera-settings")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("permission-camera-alt"));
    expect(onAlternate).toHaveBeenCalled();
  });

  test("limited location keeps the manual site alternative", async () => {
    const onAlternate = jest.fn();
    await render(<PermissionPrompt kind="locationForeground" state="denied" onRequest={() => undefined} onAlternate={onAlternate} />);
    await fireEvent.press(screen.getByTestId("permission-locationForeground-alt"));
    expect(onAlternate).toHaveBeenCalled();
  });

  test("a reopened report draft resumes on the same step and missing evidence blocks sending", async () => {
    const { runtime } = await createTestRuntime();
    setServices({ db: runtime.db, userId: USER_ID, newId: testId });
    setSyncRuntime(runtime);
    const id = testId();
    await saveDraft(runtime.db, {
      id,
      kind: "FIELD_REPORT",
      refId: null,
      step: "review",
      payload: { id, unregisteredAssetDesc: "Trator sem etiqueta", media: [], title: "Vazamento", category: "LEAK", priority: "HIGH", machineOperable: false },
      updatedAt: "2026-03-01T12:00:00.000Z",
    });
    await render(<ReportWizardScreen draftId={id} />);
    expect(await screen.findByTestId("report-draft-restored")).toBeTruthy();
    expect(await screen.findByTestId("report-review-evidence")).toBeTruthy();
    await fireEvent.press(screen.getByText("Enviar relato"));
    await waitFor(async () => expect(await listOutbox(runtime.db)).toHaveLength(0));
    expect(screen.getByTestId("report-wizard")).toBeTruthy();
  });
});
