// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { emitNavigationStart } from "./routeEvents";
import { PROGRESS_DELAY_MS, PROGRESS_SAFETY_MS, RouteMotionProvider, VIEW_TRANSITION_CAP_MS } from "./RouteMotion";

const nav = vi.hoisted(() => ({ pathname: "/ops", search: "" }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));

function setReducedMotion(reduced: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  });
}

function ui() {
  return (
    <RouteMotionProvider>
      <a href="/assets">Assets</a>
      <a href="https://example.com/x">External</a>
      <p>page</p>
    </RouteMotionProvider>
  );
}

const bar = () => document.querySelector<HTMLElement>("[data-testid=route-progress]");
const page = () => document.querySelector<HTMLElement>("[data-route-page]");

let animate: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  nav.pathname = "/ops";
  nav.search = "";
  window.history.replaceState(null, "", "/ops");
  setReducedMotion(false);
  animate = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
  // Links must not actually navigate jsdom.
  document.addEventListener("click", preventNavigation);
});

function preventNavigation(event: Event) {
  event.preventDefault();
}

afterEach(() => {
  cleanup();
  document.removeEventListener("click", preventNavigation);
  vi.useRealTimers();
  Reflect.deleteProperty(HTMLElement.prototype, "animate");
  Reflect.deleteProperty(document, "startViewTransition");
});

describe("RouteMotionProvider progress bar", () => {
  it("stays hidden for navigations faster than the delay threshold", () => {
    const view = render(ui());
    fireEvent.click(view.getByText("Assets"));
    act(() => vi.advanceTimersByTime(PROGRESS_DELAY_MS - 20));
    expect(bar()?.dataset.state).toBe("idle");
    nav.pathname = "/assets";
    view.rerender(ui());
    act(() => vi.advanceTimersByTime(1000));
    expect(bar()?.dataset.state).toBe("idle");
  });

  it("appears after the threshold, trickles, and completes when the pathname changes", () => {
    const view = render(ui());
    fireEvent.click(view.getByText("Assets"));
    act(() => vi.advanceTimersByTime(PROGRESS_DELAY_MS + 10));
    expect(bar()?.dataset.state).toBe("running");
    const first = bar()?.firstElementChild?.getAttribute("style") ?? "";
    act(() => vi.advanceTimersByTime(1000));
    expect(bar()?.firstElementChild?.getAttribute("style")).not.toBe(first);
    nav.pathname = "/assets";
    view.rerender(ui());
    expect(bar()?.dataset.state).toBe("done");
    expect(bar()?.firstElementChild?.getAttribute("style")).toContain("scaleX(1)");
    act(() => vi.advanceTimersByTime(1000));
    expect(bar()?.dataset.state).toBe("idle");
  });

  it("completes when only the search params change", () => {
    const view = render(ui());
    act(() => emitNavigationStart("/ops?kpi=late"));
    act(() => vi.advanceTimersByTime(PROGRESS_DELAY_MS + 10));
    expect(bar()?.dataset.state).toBe("running");
    nav.search = "kpi=late";
    view.rerender(ui());
    expect(bar()?.dataset.state).toBe("done");
  });

  it("ignores external links, same-page links and modified clicks", () => {
    const view = render(ui());
    fireEvent.click(view.getByText("External"));
    fireEvent.click(view.getByText("Assets"), { metaKey: true });
    act(() => emitNavigationStart("/ops"));
    act(() => vi.advanceTimersByTime(PROGRESS_DELAY_MS * 3));
    expect(bar()?.dataset.state).toBe("idle");
  });

  it("clears itself when a navigation never commits", () => {
    const view = render(ui());
    fireEvent.click(view.getByText("Assets"));
    act(() => vi.advanceTimersByTime(PROGRESS_SAFETY_MS + 1000));
    expect(bar()?.dataset.state).toBe("idle");
  });
});

describe("RouteMotionProvider page transition", () => {
  it("fades the page content in on route change", () => {
    const view = render(ui());
    expect(animate).not.toHaveBeenCalled();
    nav.pathname = "/assets";
    view.rerender(ui());
    expect(animate).toHaveBeenCalledTimes(1);
    const [keyframes, options] = animate.mock.calls[0] as [Keyframe[], KeyframeAnimationOptions];
    expect(keyframes[0]).toMatchObject({ opacity: 0, transform: "translateY(6px)" });
    expect(options.duration).toBeGreaterThanOrEqual(150);
    expect(options.duration).toBeLessThanOrEqual(200);
    expect(animate.mock.contexts[0]).toBe(page());
  });

  it("hands the transition to the View Transitions API when the route commits in time", async () => {
    const startViewTransition = vi.fn((update: () => Promise<void>) => {
      void update();
    });
    Object.defineProperty(document, "startViewTransition", { configurable: true, value: startViewTransition });
    const view = render(ui());
    fireEvent.click(view.getByText("Assets"));
    expect(startViewTransition).toHaveBeenCalledTimes(1);
    nav.pathname = "/assets";
    view.rerender(ui());
    expect(animate).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(500));
  });

  it("skips the view transition when the route is slow, then animates on commit", async () => {
    const skipTransition = vi.fn();
    const startViewTransition = vi.fn((update: () => Promise<void>) => {
      void update();
      return { skipTransition };
    });
    Object.defineProperty(document, "startViewTransition", { configurable: true, value: startViewTransition });
    const view = render(ui());
    fireEvent.click(view.getByText("Assets"));
    await act(async () => vi.advanceTimersByTimeAsync(VIEW_TRANSITION_CAP_MS + 10));
    expect(skipTransition).toHaveBeenCalledTimes(1);
    nav.pathname = "/assets";
    view.rerender(ui());
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it("does not move anything with reduced motion", () => {
    setReducedMotion(true);
    const startViewTransition = vi.fn();
    Object.defineProperty(document, "startViewTransition", { configurable: true, value: startViewTransition });
    const view = render(ui());
    fireEvent.click(view.getByText("Assets"));
    act(() => vi.advanceTimersByTime(PROGRESS_DELAY_MS + 10));
    // The static bar is still allowed.
    expect(bar()?.dataset.state).toBe("running");
    nav.pathname = "/assets";
    view.rerender(ui());
    expect(startViewTransition).not.toHaveBeenCalled();
    expect(animate).not.toHaveBeenCalled();
    expect(page()?.hasAttribute("data-entering")).toBe(false);
  });
});
