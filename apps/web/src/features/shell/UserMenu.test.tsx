// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/features/ops/testing";

import { UserMenu } from "./UserMenu";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/ops",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("./LanguageSwitch", () => ({ LanguageSwitch: () => <select aria-label="Language" /> }));

afterEach(cleanup);

describe("UserMenu", () => {
  it("is a disclosure: focus moves in, Escape closes and returns focus, no ARIA menu roles", async () => {
    renderWithProviders(<UserMenu name="Ana" roleLabel="Admin" showGuide />);
    const trigger = screen.getByRole("button", { name: /Ana/ });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const panel = screen.getByRole("region");
    expect(trigger.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.contains(document.activeElement)).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("region")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on a click outside", async () => {
    renderWithProviders(
      <div>
        <p>outside</p>
        <UserMenu name="Ana" roleLabel="Admin" />
      </div>,
    );
    await userEvent.click(screen.getByRole("button", { name: /Ana/ }));
    expect(screen.getByRole("region")).toBeTruthy();
    await userEvent.click(screen.getByText("outside"));
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("offers the getting-started guide only when asked to", async () => {
    const { unmount } = renderWithProviders(<UserMenu name="Ana" roleLabel="Admin" showGuide />);
    await userEvent.click(screen.getByRole("button", { name: /Ana/ }));
    expect(screen.getByTestId("user-menu-guide").getAttribute("href")).toBe("/getting-started");
    unmount();
    renderWithProviders(<UserMenu name="Bia" roleLabel="Manager" />);
    await userEvent.click(screen.getByRole("button", { name: /Bia/ }));
    expect(screen.queryByTestId("user-menu-guide")).toBeNull();
  });
});
