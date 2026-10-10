// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../messages/en/common.json";
import { PageSkeleton, SLOW_LOADING_MS } from "./PageSkeleton";

vi.mock("@/components/motion/Lottie", () => ({ Lottie: ({ id }: { id: string }) => <div data-animation={id} data-testid="lottie" /> }));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderSkeleton(variant: "list" | "dashboard" | "detail" | "form") {
  return render(
    <NextIntlClientProvider locale="en" messages={{ common: en }}>
      <PageSkeleton variant={variant} />
    </NextIntlClientProvider>,
  );
}

describe("PageSkeleton", () => {
  it.each(["list", "dashboard", "detail", "form"] as const)("renders the %s layout as a busy status", (variant) => {
    renderSkeleton(variant);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.dataset.variant).toBe(variant);
    expect(status.querySelectorAll("[data-skeleton]").length).toBeGreaterThan(4);
  });

  it("adds the loading animation and text only after two seconds", () => {
    renderSkeleton("list");
    expect(screen.queryByTestId("slow-loading")).toBeNull();
    act(() => vi.advanceTimersByTime(SLOW_LOADING_MS + 10));
    expect(screen.getByTestId("slow-loading").textContent).toContain(en.states.loading);
    expect(screen.getByTestId("lottie").dataset.animation).toBe("loading");
  });
});
