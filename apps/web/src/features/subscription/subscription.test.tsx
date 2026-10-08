// @vitest-environment jsdom
import type { SubscriptionDTO } from "@agrorende/core/modules/tenancy/dto";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { intlErrors, renderWithProviders } from "../ops/testing";

import { SubscriptionView } from "./SubscriptionPage";
import { formatBytes, statusWindow } from "./window";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/settings/subscription", useSearchParams: () => new URLSearchParams() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const NOW = new Date("2026-11-20T12:00:00.000Z");

function subscription(overrides: Partial<SubscriptionDTO>): SubscriptionDTO {
  return {
    organizationId: "o1",
    name: "Fazenda Boa Vista",
    status: "TRIAL",
    plan: "trial",
    trialEndsAt: "2026-11-30T12:00:00.000Z",
    pastDueAt: null,
    suspendedAt: null,
    cancelledAt: null,
    purgeAfter: null,
    terms: { currentVersion: "2026-01", acceptedVersion: "2026-01", acceptedAt: "2026-10-31T12:00:00.000Z", needsAcceptance: false },
    readOnly: false,
    exportDeadline: null,
    supportWhatsApp: "+5534999990000",
    usage: [{ month: "2026-11-01", activeFieldUsers: 4, officeUsers: 2, storageBytes: 5 * 1024 * 1024, assetCount: 12, updatedAt: NOW.toISOString() }],
    gettingStarted: { steps: [], completed: true, dismissedAt: null },
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  intlErrors.length = 0;
});

describe("statusWindow", () => {
  it("counts down the trial, the PAST_DUE grace and the export window", () => {
    expect(statusWindow({ status: "TRIAL", trialEndsAt: "2026-11-30T12:00:00.000Z", pastDueAt: null, purgeAfter: null }, NOW)).toMatchObject({ kind: "trial", daysLeft: 10, totalDays: 30 });
    expect(statusWindow({ status: "PAST_DUE", trialEndsAt: null, pastDueAt: "2026-11-10T12:00:00.000Z", purgeAfter: null }, NOW)).toMatchObject({ kind: "grace", daysLeft: 4, totalDays: 14, endsAt: "2026-11-24T12:00:00.000Z" });
    expect(statusWindow({ status: "CANCELLED", trialEndsAt: null, pastDueAt: null, purgeAfter: "2027-02-18T12:00:00.000Z" }, NOW)).toMatchObject({ kind: "export", daysLeft: 90 });
    expect(statusWindow({ status: "ACTIVE", trialEndsAt: null, pastDueAt: null, purgeAfter: null }, NOW)).toBeNull();
    expect(statusWindow({ status: "TRIAL", trialEndsAt: "2026-11-01T00:00:00.000Z", pastDueAt: null, purgeAfter: null }, NOW)).toMatchObject({ daysLeft: 0 });
  });

  it("formats storage in the user's locale", () => {
    expect(formatBytes(5 * 1024 * 1024, "en")).toMatch(/5(\.0)?\s?MB/);
  });
});

describe("SubscriptionView", () => {
  it("shows the trial meter, usage and the cancel entry point in English", () => {
    renderWithProviders(<SubscriptionView data={subscription({})} now={NOW} />, { locale: "en" });
    expect(screen.getByRole("meter")).toBeTruthy();
    expect(screen.getByText("10")).toBeTruthy();
    expect(screen.getByText("Free trial")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Cancel the account/ })).toBeTruthy();
    expect(intlErrors).toEqual([]);
  });

  it("explains read-only access and the export deadline for a cancelled account in pt-BR", () => {
    const data = subscription({ status: "CANCELLED", cancelledAt: "2026-11-20T00:00:00.000Z", purgeAfter: "2027-02-18T12:00:00.000Z", exportDeadline: "2027-02-18T12:00:00.000Z", readOnly: true });
    renderWithProviders(<SubscriptionView data={data} now={NOW} />, { locale: "pt-BR" });
    expect(screen.getByText(/modo só leitura/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Ir para relatórios/ }).getAttribute("href")).toBe("/reports");
    expect(screen.queryByRole("button", { name: /Cancelar a conta/ })).toBeNull();
    expect(intlErrors).toEqual([]);
  });
});
