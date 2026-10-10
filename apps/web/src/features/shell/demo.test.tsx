// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { renderWithProviders } from "@/features/ops/testing";

import { DEMO_BANNER_DISMISSED_KEY, DEMO_ORG_ID, DemoBanner, isDemoOrg } from "./demo";

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

describe("demo indication", () => {
  it("recognises the seeded demo organisation or an explicit demo mode", () => {
    expect(isDemoOrg(DEMO_ORG_ID, undefined)).toBe(true);
    expect(isDemoOrg("018fd000-0000-7000-8000-000000000002", undefined)).toBe(false);
    expect(isDemoOrg(null, "1")).toBe(true);
    expect(isDemoOrg(undefined, undefined)).toBe(false);
  });

  it("shows the banner until dismissed for the session", async () => {
    const { unmount } = renderWithProviders(<DemoBanner />);
    expect(await screen.findByTestId("demo-banner")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Close demo notice" }));
    expect(screen.queryByTestId("demo-banner")).toBeNull();
    expect(window.sessionStorage.getItem(DEMO_BANNER_DISMISSED_KEY)).toBe("1");
    unmount();
    renderWithProviders(<DemoBanner />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByTestId("demo-banner")).toBeNull();
  });
});
