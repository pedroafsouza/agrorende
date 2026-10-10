import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { firstRunRoute } from "../../src/auth/ui/firstRun";
import { IntroScreen } from "../../src/auth/ui/IntroScreen";
import { saveDevicePrefs } from "../../src/lib/app/prefs";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }) }));
jest.mock("../../src/lib/app/prefs", () => ({
  loadDevicePrefs: jest.fn(async () => ({})),
  saveDevicePrefs: jest.fn(async (patch: object) => ({ ...patch })),
}));

describe("first-run intro", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    jest.mocked(saveDevicePrefs).mockClear();
  });

  it("routes intro first, then permissions, then Hoje", () => {
    expect(firstRunRoute({})).toBe("/intro");
    expect(firstRunRoute({ onboarded: true })).toBe("/intro");
    expect(firstRunRoute({ introSeen: true })).toBe("/onboarding");
    expect(firstRunRoute({ introSeen: true, onboarded: true })).toBe("/today");
  });

  it("walks the three cards and remembers it was seen", async () => {
    await render(<IntroScreen />);
    expect(screen.getByText("Funciona sem sinal")).toBeTruthy();
    expect(await screen.findByTestId("lottie-report-offline-player", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId("lottie-report-offline")).toBeNull();
    expect(screen.getByText("Pular")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("intro-next"));
    expect(screen.getByText("Do relato à entrega")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("intro-next"));
    expect(screen.getByText("O cliente assina no seu celular")).toBeTruthy();
    expect(screen.getByText("Começar")).toBeTruthy();
    expect(screen.getByText("Pular")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("intro-next"));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/onboarding"));
    expect(saveDevicePrefs).toHaveBeenCalledWith({ introSeen: true });
  });

  it("skips from the first card", async () => {
    await render(<IntroScreen />);
    await fireEvent.press(screen.getByTestId("intro-skip"));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/onboarding"));
  });
});
