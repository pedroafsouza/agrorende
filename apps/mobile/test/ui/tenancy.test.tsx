import { render, screen } from "@testing-library/react-native";

import { OrgStatusBanner } from "../../src/features/tenancy";
import { initI18n } from "../../src/i18n";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }) }));
jest.mock("expo-haptics", () => ({ notificationAsync: jest.fn(), impactAsync: jest.fn(), selectionAsync: jest.fn(), NotificationFeedbackType: {}, ImpactFeedbackStyle: {} }));

describe("OrgStatusBanner", () => {
  afterAll(() => {
    initI18n("pt-BR");
  });

  test.each(["TRIAL", "ACTIVE", "PAST_DUE"] as const)("stays hidden for %s", async (status) => {
    await render(<OrgStatusBanner status={status} />);
    expect(screen.queryByTestId("org-status-banner")).toBeNull();
  });

  test("shows the paused copy in pt-BR for a suspended company", async () => {
    initI18n("pt-BR");
    await render(<OrgStatusBanner status="SUSPENDED" />);
    expect(screen.getByTestId("org-status-banner")).toBeTruthy();
    expect(screen.getByText("Acesso da empresa pausado")).toBeTruthy();
    expect(screen.getByText("Continue registrando: tudo fica salvo e será enviado quando a empresa voltar.")).toBeTruthy();
  });

  test("shows the paused copy in English for a cancelled company", async () => {
    initI18n("en");
    await render(<OrgStatusBanner status="CANCELLED" />);
    expect(screen.getByText("Company access paused")).toBeTruthy();
    expect(screen.getByText("Keep recording: everything stays saved and will send when the company is back.")).toBeTruthy();
  });
});
