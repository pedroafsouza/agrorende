// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/features/ops/testing";

import { PAGE_CONTEXT_HIDDEN_KEY, PageContext } from "./PageContext";

const nav = vi.hoisted(() => ({ pathname: "/ops" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function crumbs(): HTMLElement {
  return screen.getByRole("navigation", { name: "You are here" });
}

describe("PageContext", () => {
  it("shows Home, the section and a details crumb on a detail page", () => {
    nav.pathname = "/work-orders/abc123";
    renderWithProviders(<PageContext role="MANAGER" />);
    const trail = crumbs();
    expect(within(trail).getByRole("link", { name: "Home" }).getAttribute("href")).toBe("/ops");
    expect(within(trail).getByRole("link", { name: "Work orders" }).getAttribute("href")).toBe("/work-orders");
    expect(within(trail).getByText("Details").getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("region", { name: "About this page" }).textContent).toContain("Work orders from request to close");
  });

  it("shows parent sections for nested pages", () => {
    nav.pathname = "/team/devices";
    renderWithProviders(<PageContext role="ADMIN" />);
    const trail = crumbs();
    expect(within(trail).getByRole("link", { name: "Team" }).getAttribute("href")).toBe("/team");
    expect(within(trail).getByText("Team phones").getAttribute("aria-current")).toBe("page");
  });

  it("hides related pages the role cannot open", () => {
    nav.pathname = "/assets";
    renderWithProviders(<PageContext role="MANAGER" />);
    const related = screen.getByRole("navigation", { name: "Related pages" });
    expect(within(related).getByRole("link", { name: "Preventive maintenance" })).toBeTruthy();
    expect(within(related).queryByRole("link", { name: "Import spreadsheet" })).toBeNull();
  });

  it("hides the explanation and remembers the choice", async () => {
    nav.pathname = "/ops";
    renderWithProviders(<PageContext role="MANAGER" />);
    const toggle = screen.getByTestId("page-context-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    await userEvent.click(toggle);
    expect(screen.queryByRole("region", { name: "About this page" })).toBeNull();
    expect(toggle.textContent).toBe("About this page");
    expect(window.localStorage.getItem(PAGE_CONTEXT_HIDDEN_KEY)).toBe("1");
    cleanup();
    renderWithProviders(<PageContext role="MANAGER" />);
    expect(screen.queryByRole("region", { name: "About this page" })).toBeNull();
  });

  it("renders nothing outside the sidebar pages", () => {
    nav.pathname = "/office-role-required";
    const { container } = renderWithProviders(<PageContext role="FIELD" />);
    expect(container.querySelector("[data-testid=page-context]")).toBeNull();
  });
});
