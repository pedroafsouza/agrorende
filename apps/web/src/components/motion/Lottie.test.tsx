// @vitest-environment jsdom
import { act, cleanup, fireEvent, render as rtlRender, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Motion from "@agrorende/motion";
import { motionMeta } from "@agrorende/motion";

import en from "../../../messages/en/common.json";
import { Lottie, needsPauseControl } from "./Lottie";

function render(ui: ReactElement) {
  return rtlRender(
    <NextIntlClientProvider locale="en" messages={{ common: en }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const player = vi.hoisted(() => {
  const listeners = new Map<string, () => void>();
  const animation = {
    play: vi.fn(),
    pause: vi.fn(),
    goToAndStop: vi.fn(),
    destroy: vi.fn(),
    addEventListener: vi.fn((name: string, fn: () => void) => listeners.set(name, fn)),
  };
  return { animation, listeners, loadAnimation: vi.fn((_params: Record<string, unknown>) => animation) };
});

vi.mock("lottie-web/build/player/lottie_light", () => ({ default: { loadAnimation: player.loadAnimation } }));
vi.mock("@agrorende/motion", async (importOriginal) => ({
  ...(await importOriginal<typeof Motion>()),
  loadAnimation: vi.fn(async () => ({ v: "5.12.0", fr: 30, ip: 0, op: 60, w: 400, h: 300, layers: [] })),
}));

let observerCallback: ((entries: { isIntersecting: boolean }[]) => void) | null = null;
const disconnect = vi.fn();

function setReducedMotion(reduced: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  player.listeners.clear();
  observerCallback = null;
  setReducedMotion(false);
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        observerCallback = callback;
      }
      observe() {}
      disconnect() {
        disconnect();
      }
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Lottie", () => {
  it("reserves the animation's aspect ratio and hides itself from assistive technology", () => {
    const { getByTestId } = render(<Lottie id="welcome" />);
    const box = getByTestId("lottie");
    expect(getByTestId("lottie-canvas").getAttribute("aria-hidden")).toBe("true");
    expect(box.style.aspectRatio).toBe(`${motionMeta.welcome.width} / ${motionMeta.welcome.height}`);
  });

  it("loads the SVG renderer lazily and plays while on screen", async () => {
    render(<Lottie id="empty" />);
    await waitFor(() => expect(player.loadAnimation).toHaveBeenCalledTimes(1));
    const params = player.loadAnimation.mock.calls[0]?.[0];
    expect(params).toMatchObject({ renderer: "svg", autoplay: false, loop: motionMeta.empty.loop });
    expect(player.animation.play).toHaveBeenCalled();

    player.animation.play.mockClear();
    observerCallback?.([{ isIntersecting: false }]);
    expect(player.animation.pause).toHaveBeenCalled();
    observerCallback?.([{ isIntersecting: true }]);
    expect(player.animation.play).toHaveBeenCalledTimes(1);
  });

  it("shows the poster frame and never plays when the user prefers reduced motion", async () => {
    setReducedMotion(true);
    render(<Lottie id="success" />);
    await waitFor(() => expect(player.animation.goToAndStop).toHaveBeenCalledWith(motionMeta.success.posterFrame, true));
    observerCallback?.([{ isIntersecting: true }]);
    expect(player.animation.play).not.toHaveBeenCalled();
  });

  it("plays a looping animation once when asked and does not restart it after it finishes", async () => {
    render(<Lottie id="empty" playOnce />);
    await waitFor(() => expect(player.loadAnimation).toHaveBeenCalled());
    expect(player.loadAnimation.mock.calls[0]?.[0]).toMatchObject({ loop: false });
    player.listeners.get("complete")?.();
    player.animation.play.mockClear();
    observerCallback?.([{ isIntersecting: false }]);
    observerCallback?.([{ isIntersecting: true }]);
    expect(player.animation.play).not.toHaveBeenCalled();
  });

  it("destroys the player and the observer on unmount", async () => {
    const { unmount } = render(<Lottie id="first-machine" />);
    await waitFor(() => expect(player.loadAnimation).toHaveBeenCalled());
    unmount();
    expect(player.animation.destroy).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("offers a 48 px pause and play control on looping animations", async () => {
    expect(needsPauseControl(true, 1000)).toBe(true);
    expect(needsPauseControl(false, 1000)).toBe(false);
    const { findByRole } = render(<Lottie id="empty" />);
    const button = await findByRole("button", { name: "Pause animation" });
    expect(button.className).toContain("size-12");
    player.animation.play.mockClear();
    act(() => fireEvent.click(button));
    expect(player.animation.pause).toHaveBeenCalled();
    expect(await findByRole("button", { name: "Play animation" })).toBeTruthy();
    observerCallback?.([{ isIntersecting: true }]);
    expect(player.animation.play).not.toHaveBeenCalled();
    act(() => fireEvent.click(button));
    expect(player.animation.play).toHaveBeenCalledTimes(1);
  });

  it("has no pause control when the animation plays once or motion is reduced", async () => {
    const once = render(<Lottie id="empty" playOnce />);
    await waitFor(() => expect(player.loadAnimation).toHaveBeenCalled());
    expect(once.queryByRole("button")).toBeNull();
    once.unmount();
    setReducedMotion(true);
    const reduced = render(<Lottie id="empty" />);
    await waitFor(() => expect(player.animation.goToAndStop).toHaveBeenCalled());
    expect(reduced.queryByRole("button")).toBeNull();
  });
});
