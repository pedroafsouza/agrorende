// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OPEN_COMMAND_PALETTE_EVENT } from "@/features/command-palette";
import { renderWithProviders } from "@/features/ops/testing";

import { AdminShell } from "./AdminShell";
import { NAV_GROUPS_CLOSED_KEY } from "./useClosedNavGroups";
import { SIDEBAR_COLLAPSED_KEY } from "./useSidebarCollapsed";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/ops",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("./useMe", () => ({ useMe: () => ({ data: { user: { id: "u1", name: "Ana", role: "MANAGER" }, org: { name: "Fazenda Boa Vista" } } }) }));
vi.mock("./useRealtime", () => ({ useRealtime: () => "connected" }));
vi.mock("./NotificationsBell", () => ({ NotificationsBell: () => null, useAttentionCount: () => 0 }));
vi.mock("./UserMenu", () => ({ UserMenu: () => null }));
vi.mock("@/components/recovery/RealtimeStatus", () => ({ RealtimeStatus: () => null }));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("AdminShell search box", () => {
  it("is an enabled button that opens the command palette (T16-002)", async () => {
    const opened = vi.fn();
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, opened);
    renderWithProviders(
      <AdminShell ribbon={null} role="MANAGER">
        <p>content</p>
      </AdminShell>,
    );
    const trigger = screen.getByTestId("shell-search");
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger).not.toHaveProperty("disabled", true);
    expect(trigger.getAttribute("aria-keyshortcuts")).toBe("Control+K Meta+K");
    expect(trigger.textContent).toBe("Search (Ctrl+K)");
    await userEvent.click(trigger);
    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, opened);
  });
});

describe("AdminShell sidebar", () => {
  function renderShell() {
    return renderWithProviders(
      <AdminShell ribbon={null} role="MANAGER">
        <p>content</p>
      </AdminShell>,
    );
  }

  it("collapses to an icon rail, keeps labels for assistive tech and remembers the choice", async () => {
    const { container } = renderShell();
    const toggle = screen.getByTestId("sidebar-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-label")).toBe("Collapse menu");

    await userEvent.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-label")).toBe("Expand menu");
    expect(container.querySelector("[data-sidebar]")?.getAttribute("data-sidebar")).toBe("collapsed");
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe("1");
    const ops = screen.getByRole("link", { name: "Overview" });
    expect(ops.getAttribute("title")).toBe("Overview");
  });

  it("starts collapsed when the browser remembered it and toggles with Ctrl+B", async () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, "1");
    renderShell();
    const toggle = await screen.findByRole("button", { name: "Expand menu" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    await userEvent.keyboard("{Control>}b{/Control}");

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe("0");
  });
});

describe("AdminShell categories", () => {
  function renderShell() {
    return renderWithProviders(
      <AdminShell ribbon={null} role="MANAGER">
        <p>content</p>
      </AdminShell>,
    );
  }

  it("groups the pages into categories and leaves account and notifications to the top bar", () => {
    const { container } = renderShell();
    const groups = Array.from(container.querySelectorAll("[data-nav-group]")).map((el) => el.getAttribute("data-nav-group"));
    expect(groups).toEqual(["overview", "service", "fleet", "customers", "finance", "admin"]);
    const fleet = screen.getByRole("list", { name: "Fleet" });
    expect(Array.from(fleet.querySelectorAll(":scope > li > a")).map((a) => a.textContent)).toEqual(["Assets", "Fuel", "Parts", "Stock"]);
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(nav.querySelector('a[href="/account"]')).toBeNull();
    expect(nav.querySelector('a[href="/notifications"]')).toBeNull();
    expect(nav.querySelector('a[href="/seasons"]')).toBeNull();
  });

  it("folds a category and remembers it", async () => {
    renderShell();
    const heading = screen.getByRole("button", { name: "Hide Fleet" });
    expect(heading.getAttribute("aria-expanded")).toBe("true");
    await userEvent.click(heading);
    expect(heading.getAttribute("aria-expanded")).toBe("false");
    expect(heading.getAttribute("aria-label")).toBe("Show Fleet");
    expect(window.localStorage.getItem(NAV_GROUPS_CLOSED_KEY)).toBe('["fleet"]');
  });

  it("starts with the remembered categories folded", async () => {
    window.localStorage.setItem(NAV_GROUPS_CLOSED_KEY, '["finance","bogus"]');
    renderShell();
    expect((await screen.findByRole("button", { name: "Show Finance" })).getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("button", { name: "Hide Service" }).getAttribute("aria-expanded")).toBe("true");
  });
});
