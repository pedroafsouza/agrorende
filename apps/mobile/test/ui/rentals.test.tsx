import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { validateCheckOut } from "@agrorende/contracts/charges";
import { RentalCheckoutPayloadSchema, type RentalCheckoutPayload } from "@agrorende/contracts/mutations";
import type * as MockRN from "react-native";

import { authStore } from "../../src/auth/session";
import type { UserDTO } from "@agrorende/contracts";
import { getMirrorRow } from "../../src/db/mirror";
import { CheckoutWizardScreen } from "../../src/features/rentals/InspectionWizardScreen";
import { draftIdFor, loadInspectionContext, newInspectionDraft, validationArgs, WALKAROUND_TAGS } from "../../src/features/rentals/logic";
import { RentalDetailScreen } from "../../src/features/rentals/RentalDetailScreen";
import { RentalsScreen } from "../../src/features/rentals/RentalsScreen";
import { RentalsTodayCard } from "../../src/features/rentals/widgets";
import { saveDraft } from "../../src/lib/drafts";
import { setServices } from "../../src/lib/services";
import { listOutbox } from "../../src/sync/outbox";
import { setSyncRuntime } from "../../src/sync/runtime";
import { photo, seedRental } from "../helpers/rentals";
import { createTestRuntime, testId, USER_ID } from "../helpers/runtime";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }), useLocalSearchParams: () => ({}) }));
jest.mock("expo-haptics", () => ({ notificationAsync: jest.fn(async () => undefined), impactAsync: jest.fn(async () => undefined), selectionAsync: jest.fn(async () => undefined), NotificationFeedbackType: {}, ImpactFeedbackStyle: {} }));
jest.mock("../../src/features/assets/ScanView", () => ({ ScanView: () => null }));

let mockSeq = 0;
function mockUuid(): string {
  mockSeq += 1;
  return `01900000-0000-7000-9000-${mockSeq.toString(16).padStart(12, "0")}`;
}

/** Camera stand-in: one press captures one photo for every allowed tag. */
jest.mock("../../src/components/MediaCapture", () => {
  const { Pressable, Text } = jest.requireActual<typeof MockRN>("react-native");
  type MockProps = { parent: { type: string; id: string }; allowedTags: readonly string[]; value?: readonly Record<string, unknown>[]; onChange: (drafts: readonly Record<string, unknown>[]) => void; checklistItemKey?: string };
  return {
    Thumbnails: () => null,
    MediaCapture: ({ parent, allowedTags, value, onChange, checklistItemKey }: MockProps) => (
      <Pressable
        testID={`mock-capture-${allowedTags.join("-")}`}
        onPress={() =>
          onChange([
            ...(value ?? []),
            ...allowedTags.map((tag) => ({ id: mockUuid(), kind: "PHOTO", tag, mimeType: "image/jpeg", capturedAt: "2026-03-01T12:00:00.000Z", parent, localUri: "file:///docs/p.jpg", ...(checklistItemKey === undefined ? {} : { checklistItemKey }) })),
          ])
        }
      >
        <Text>capture</Text>
      </Pressable>
    ),
  };
});

/** Signature pad stand-in: one press signs as Maria Silva. */
jest.mock("../../src/components/SignaturePad", () => {
  const { Pressable, Text } = jest.requireActual<typeof MockRN>("react-native");
  type MockProps = { parent: { type: string; id: string }; tag: string; onSigned: (result: Record<string, unknown>) => void };
  return {
    SignaturePad: ({ parent, tag, onSigned }: MockProps) => (
      <Pressable
        testID={`mock-sign-${tag}`}
        onPress={() => onSigned({ status: "SIGNED", signerName: "Maria Silva", media: { id: mockUuid(), kind: "SIGNATURE", tag, mimeType: "image/png", capturedAt: "2026-03-01T12:00:00.000Z", parent, localUri: "file:///docs/s.png" } })}
      >
        <Text>sign</Text>
      </Pressable>
    ),
  };
});

const NOW_MS = Date.parse("2026-03-01T12:00:00.000Z");

async function setup(options: Parameters<typeof seedRental>[1] = {}) {
  const test = await createTestRuntime();
  setSyncRuntime(test.runtime);
  test.runtime.store.setState({ network: "offline" });
  const seed = await seedRental(test.runtime.db, options);
  setServices({ db: test.runtime.db, userId: USER_ID, now: () => NOW_MS, newId: testId });
  return { ...test, seed };
}

function signIn(role: "FIELD" | "ADMIN") {
  authStore.setState({ status: "signedIn", user: { id: USER_ID, name: "Agente", role } as unknown as UserDTO });
}

/** Presses Next until the step identified by `id` is gone (validation runs asynchronously). */
async function step(id: string) {
  await screen.findByTestId(id);
  await waitFor(() => expect(screen.queryByTestId("checkout-wizard-reason")).toBeNull());
  await fireEvent.press(screen.getByTestId("checkout-wizard-next"));
  await waitFor(() => expect(screen.queryByTestId(id)).toBeNull());
}

describe("check-out wizard", () => {
  test("completes offline and queues rental.checkout with a payload the server guard accepts", async () => {
    const { runtime, seed } = await setup();
    signIn("FIELD");
    await render(<CheckoutWizardScreen rentalId={seed.rentalId} />);

    await step("insp-locale");

    await fireEvent.press(await screen.findByTestId("insp-identity-confirm"));
    await step("insp-identity-ok");

    await fireEvent.press(await screen.findByTestId(`mock-capture-${WALKAROUND_TAGS.join("-")}`));
    await step("insp-walk-WALKAROUND_CAB");

    await fireEvent.changeText(await screen.findByTestId("insp-hour-meter"), "4315");
    await fireEvent.press(screen.getByTestId("insp-fuel-8"));
    await fireEvent.press(screen.getByTestId("mock-capture-HOUR_METER-FUEL_GAUGE"));
    await step("insp-photo-HOUR_METER");

    await fireEvent.press(await screen.findByTestId("checklist-answer-tires-PASS"));
    await step("checklist-runner");

    await step("insp-damage-add");
    await step("insp-accessory-0");

    await fireEvent.press(await screen.findByTestId("insp-briefing-given"));
    await fireEvent.changeText(screen.getByTestId("insp-operator-name"), "João Operador");
    await step("insp-briefing-given");

    await fireEvent.press(await screen.findByTestId("insp-terms-accept"));
    expect(screen.getByTestId("insp-terms-version")).toBeTruthy();
    await step("insp-terms-accept");

    await fireEvent.press(await screen.findByTestId("mock-sign-SIGNATURE_CUSTOMER"));
    await fireEvent.press(await screen.findByTestId("mock-sign-SIGNATURE_AGENT"));
    await screen.findByTestId("insp-customer-signed");
    await step("insp-agent-signed");

    await screen.findByTestId("insp-review-ready");
    await fireEvent.press(screen.getByTestId("checkout-wizard-next"));

    await waitFor(async () => expect((await listOutbox(runtime.db)).map((row) => row.name)).toEqual(["rental.checkout"]));
    const [row] = await listOutbox(runtime.db);
    const payload = RentalCheckoutPayloadSchema.parse(row?.payload) as RentalCheckoutPayload;
    expect(payload.rentalId).toBe(seed.rentalId);
    expect(payload.inspection.hourMeter).toBe(4315);
    expect(payload.inspection.fuelPercent).toBe(100);
    expect(payload.inspection.termsVersion).toBe(3);
    expect(payload.inspection.signerName).toBe("Maria Silva");
    expect(new Set(payload.inspection.media.map((item) => item.tag))).toEqual(new Set([...WALKAROUND_TAGS, "HOUR_METER", "FUEL_GAUGE", "SIGNATURE_CUSTOMER", "SIGNATURE_AGENT"]));
    expect(payload.inspection.media.every((item) => item.parent.type === "INSPECTION" && item.parent.id === payload.inspection.id)).toBe(true);
    const ctx = await loadInspectionContext(runtime.db, seed.rentalId, "CHECK_OUT");
    if (ctx === undefined) throw new Error("context");
    expect(validateCheckOut(...validationArgs("CHECK_OUT", payload.inspection, { ...ctx, status: "RESERVED" })).ok).toBe(true);
    expect((await getMirrorRow(runtime.db, "rentals", seed.rentalId))?.status).toBe("ACTIVE");
    expect(runtime.store.getState().network).toBe("offline");
  });

  test("RENTAL_DRAFT_INTERRUPTED: an interrupted draft resumes; review lists the missing step and focuses it", async () => {
    const { runtime, seed } = await setup();
    const ctx = await loadInspectionContext(runtime.db, seed.rentalId, "CHECK_OUT");
    if (ctx === undefined) throw new Error("context");
    const base = newInspectionDraft(ctx, { inspectionId: testId(), templateId: testId() });
    const id = base.inspectionId;
    const draft = {
      ...base,
      identityConfirmed: true,
      media: [photo(id, "HOUR_METER"), photo(id, "FUEL_GAUGE")],
      hourMeter: 4312,
      fuelPercent: 100,
      responses: [{ key: "tires", value: "PASS", answeredAt: "2026-03-01T12:00:00.000Z" }],
      safetyBriefingGiven: true,
      operatorName: "João",
      termsAccepted: true,
      signerName: "Maria",
      customerSignature: photo(id, "SIGNATURE_CUSTOMER"),
      agentSignature: photo(id, "SIGNATURE_AGENT"),
    };
    const draftId = draftIdFor("CHECK_OUT", seed.rentalId);
    await saveDraft(runtime.db, { id: draftId, kind: "CHECK_OUT", refId: seed.rentalId, step: "review", payload: draft, updatedAt: "2026-03-01T11:00:00.000Z" });

    await render(<CheckoutWizardScreen rentalId={seed.rentalId} />);
    expect(await screen.findByTestId("checkout-wizard-resumed")).toBeTruthy();
    expect(await screen.findByTestId("insp-review-missing")).toBeTruthy();
    expect(screen.queryByTestId("insp-review-fix-terms")).toBeNull();
    await waitFor(() => expect(screen.getByTestId("checkout-wizard-reason")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("checkout-wizard-next"));
    expect((await listOutbox(runtime.db)).length).toBe(0);

    await fireEvent.press(screen.getByTestId("insp-review-fix-walkaround"));
    expect(await screen.findByTestId("insp-walk-WALKAROUND_FRONT")).toBeTruthy();
  });
});

describe("rentals tab, detail and Today card", () => {
  test("today's hand-over appears in its section and on the Today card", async () => {
    const { seed } = await setup();
    signIn("FIELD");
    await render(<RentalsScreen />);
    expect(await screen.findByTestId("rentals-section-handOver")).toBeTruthy();
    expect(screen.getByTestId(`rental-row-${seed.rentalId}`)).toBeTruthy();
    expect(screen.queryByTestId("rentals-new")).toBeNull();

    await render(<RentalsTodayCard />);
    expect(await screen.findByTestId("home-rentals-today")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("home-rentals-today-handovers-count")).toHaveTextContent("1"));
    expect(screen.getByTestId("home-rentals-today-overdue-count")).toHaveTextContent("0");
  });

  test("empty tab shows the empty state", async () => {
    const { runtime } = await createTestRuntime();
    setServices({ db: runtime.db, userId: USER_ID, now: () => NOW_MS, newId: testId });
    await render(<RentalsScreen />);
    expect(await screen.findByTestId("rentals-empty")).toBeTruthy();
  });

  test("detail masks CPF/CNPJ for FIELD and offers Check out", async () => {
    const { seed } = await setup();
    signIn("FIELD");
    await render(<RentalDetailScreen rentalId={seed.rentalId} />);
    expect(await screen.findByTestId("rental-detail")).toBeTruthy();
    expect(screen.getByTestId("rental-tax-id")).toHaveTextContent(/12\.\*\*\*\.\*\*\*\/0001-95/);
    expect(screen.getByTestId("rental-tax-id")).not.toHaveTextContent(/12345678000195/);
    expect(screen.getByTestId("rental-checkout")).toBeTruthy();
    expect(screen.queryByTestId("rental-checkin")).toBeNull();
  });

  test("overdue ACTIVE rental shows the overdue banner and Check in", async () => {
    const { seed } = await setup({ status: "ACTIVE", plannedStart: "2026-02-20T11:00:00.000Z", plannedEnd: "2026-02-28T11:00:00.000Z" });
    signIn("FIELD");
    await render(<RentalDetailScreen rentalId={seed.rentalId} />);
    expect(await screen.findByTestId("rental-overdue")).toBeTruthy();
    expect(screen.getByTestId("rental-checkin")).toBeTruthy();
  });
});
