// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import enPlatform from "../../../messages/en/platform.json";
import enSignup from "../../../messages/en/signup.json";
import enSubscription from "../../../messages/en/subscription.json";
import enTenancy from "../../../messages/en/tenancy.json";
import ptPlatform from "../../../messages/pt-BR/platform.json";
import ptSignup from "../../../messages/pt-BR/signup.json";
import ptSubscription from "../../../messages/pt-BR/subscription.json";
import ptTenancy from "../../../messages/pt-BR/tenancy.json";
import { intlErrors, renderWithProviders } from "../ops/testing";

import { orgBannerFor, whatsAppHref } from "./orgBanner";
import { TenancyOrgBanner } from "./TenancyOrgBanner";

const me = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock("@/features/shell/useMe", () => ({ useMe: () => ({ data: me.data }) }));

const NOW = new Date("2026-11-20T12:00:00.000Z");

function keys(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value).flatMap(([k, v]) => keys(v, prefix.length === 0 ? k : `${prefix}.${k}`));
}

function meWith(role: string, org: Record<string, unknown>) {
  return { user: { id: "u1", name: "Ana", role }, org: { id: "o1", name: "Fazenda Boa Vista", timezone: "America/Sao_Paulo", trialEndsAt: null, pastDueAt: null, purgeAfter: null, ...org } };
}

afterEach(() => {
  cleanup();
  intlErrors.length = 0;
  me.data = undefined;
});

describe("T20 web messages", () => {
  it.each([
    ["tenancy", ptTenancy, enTenancy],
    ["signup", ptSignup, enSignup],
    ["subscription", ptSubscription, enSubscription],
    ["platform", ptPlatform, enPlatform],
  ])("%s has the same keys in pt-BR and en", (_name, pt, en) => {
    expect(keys(en).sort()).toEqual(keys(pt).sort());
  });
});

describe("orgBannerFor", () => {
  const base = { now: NOW, trialEndsAt: "2026-11-25T12:00:00.000Z", pastDueAt: "2026-11-10T12:00:00.000Z", purgeAfter: "2027-02-18T12:00:00.000Z" };

  it("shows nothing for ACTIVE organisations, field users or an unknown role", () => {
    expect(orgBannerFor({ ...base, status: "ACTIVE", role: "ADMIN" })).toBeNull();
    expect(orgBannerFor({ ...base, status: "SUSPENDED", role: "FIELD" })).toBeNull();
    expect(orgBannerFor({ ...base, status: "TRIAL", role: undefined })).toBeNull();
  });

  it("shows the trial countdown to admins only", () => {
    expect(orgBannerFor({ ...base, status: "TRIAL", role: "ADMIN" })).toMatchObject({ key: "banner.trial", values: { days: 5 }, action: { kind: "subscription", href: "/settings/subscription" } });
    expect(orgBannerFor({ ...base, status: "TRIAL", role: "MANAGER" })).toBeNull();
  });

  it("gives PAST_DUE admins the action and managers the plain notice", () => {
    expect(orgBannerFor({ ...base, status: "PAST_DUE", role: "ADMIN" })).toMatchObject({ key: "banner.pastDue.admin", values: { days: 4 }, action: { kind: "subscription" } });
    expect(orgBannerFor({ ...base, status: "PAST_DUE", role: "MANAGER" })).toMatchObject({ key: "banner.pastDue.manager", action: null });
  });

  it("points SUSPENDED and CANCELLED organisations at WhatsApp support when configured", () => {
    expect(orgBannerFor({ ...base, status: "SUSPENDED", role: "MANAGER", supportWhatsApp: "+55 (34) 99999-0000" })).toMatchObject({ key: "banner.suspended", action: { kind: "whatsapp", href: "https://wa.me/5534999990000" } });
    expect(orgBannerFor({ ...base, status: "CANCELLED", role: "ADMIN" })).toMatchObject({ key: "banner.cancelled", values: { date: base.purgeAfter }, action: { kind: "subscription" } });
    expect(whatsAppHref("")).toBeNull();
  });
});

describe("TenancyOrgBanner", () => {
  it("renders the EC-OPS-29 read-only copy in pt-BR with the WhatsApp action", () => {
    me.data = meWith("MANAGER", { status: "SUSPENDED" });
    renderWithProviders(<TenancyOrgBanner now={NOW} supportWhatsApp="+5534999990000" />, { locale: "pt-BR" });
    expect(screen.getByText("Acesso pausado: só leitura")).toBeTruthy();
    expect(screen.getByText("Você ainda pode ver e exportar os dados. Fale com a AgroRende para reativar.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /WhatsApp/ }).getAttribute("href")).toBe("https://wa.me/5534999990000");
    expect(intlErrors).toEqual([]);
  });

  it("renders the trial countdown in English", () => {
    me.data = meWith("ADMIN", { status: "TRIAL", trialEndsAt: "2026-11-25T12:00:00.000Z" });
    renderWithProviders(<TenancyOrgBanner now={NOW} />, { locale: "en" });
    expect(screen.getByText("5 trial days left")).toBeTruthy();
    expect(screen.getByRole("link", { name: /View subscription/ }).getAttribute("href")).toBe("/settings/subscription");
    expect(intlErrors).toEqual([]);
  });

  it("renders nothing for an active organisation", () => {
    me.data = meWith("ADMIN", { status: "ACTIVE" });
    const { container } = renderWithProviders(<TenancyOrgBanner now={NOW} />);
    expect(container.textContent).toBe("");
  });
});
