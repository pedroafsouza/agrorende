// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OPEN_COMMAND_PALETTE_EVENT } from "@/features/command-palette";
import { renderWithProviders } from "@/features/ops/testing";

import { AdminShell } from "./AdminShell";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/ops",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("./useMe", () => ({ useMe: () => ({ data: { user: { id: "u1", name: "Ana", role: "MANAGER" }, org: { name: "Fazenda Boa Vista" } } }) }));
vi.mock("./useRealtime", () => ({ useRealtime: () => "connected" }));
vi.mock("./NotificationsBell", () => ({ NotificationsBell: () => null, useAttentionCount: () => 0 }));
vi.mock("./UserMenu", () => ({ UserMenu: () => null }));
vi.mock("./ThemeToggle", () => ({ ThemeToggle: () => null }));
vi.mock("./LanguageSwitch", () => ({ LanguageSwitch: () => null }));
vi.mock("@/components/recovery/RealtimeStatus", () => ({ RealtimeStatus: () => null }));

afterEach(cleanup);

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
    expect(trigger.textContent).toBe("Search or run a command (Ctrl+K)");
    await userEvent.click(trigger);
    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, opened);
  });
});
