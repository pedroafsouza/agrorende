import { render, screen } from "@testing-library/react-native";

import { authStore } from "../../src/auth/session";
import { TodayScreen } from "../../src/features/home/TodayScreen";
import { OrgStatusBanner } from "../../src/features/tenancy";
import { initI18n } from "../../src/i18n";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }) }));
jest.mock("../../src/features/home/widgets", () => {
  const Empty = () => null;
  return { DutyCard: Empty, MyReportsCard: Empty, NextJobCard: Empty, QuickReportCard: Empty, RentalsTodayCard: Empty, SyncCard: Empty };
});

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

describe("Today screen organisation banner", () => {
  afterEach(() => {
    authStore.setState({ status: "signedOut", needsReauth: false }, true);
  });

  test("shows the paused banner on Home while the company is suspended (EC-PLT-40)", async () => {
    initI18n("en");
    authStore.setState({ status: "signedIn", needsReauth: false, org: { status: "SUSPENDED" } as never });
    await render(<TodayScreen />);
    expect(screen.getByTestId("org-status-banner")).toBeTruthy();
  });

  test("hides the banner for an active company", async () => {
    authStore.setState({ status: "signedIn", needsReauth: false, org: { status: "ACTIVE" } as never });
    await render(<TodayScreen />);
    expect(screen.queryByTestId("org-status-banner")).toBeNull();
  });
});
