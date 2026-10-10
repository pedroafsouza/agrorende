// @vitest-environment jsdom
import type * as Motion from "@agrorende/motion";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const player = {
  play: vi.fn(),
  pause: vi.fn(),
  goToAndStop: vi.fn(),
  addEventListener: vi.fn(),
  destroy: vi.fn(),
};
const loadPlayer = vi.fn((_params: { loop: boolean; renderer: string; autoplay: boolean }) => player);

vi.mock("lottie-web/build/player/lottie_light", () => ({ default: { loadAnimation: loadPlayer } }));
vi.mock("@agrorende/motion", async (importOriginal) => {
  const actual = await importOriginal<MotionModule>();
  return { ...actual, loadAnimation: vi.fn(() => Promise.resolve({ v: "5.12.0", layers: [] })) };
});

import { motionMeta } from "@agrorende/motion";

import { Lottie, needsPauseControl } from "./Lottie";

type MotionModule = typeof Motion;

const labels = { pause: "Pause animation", play: "Play animation" };

let reduced = false;
let observerCallback: ((entries: { isIntersecting: boolean }[]) => void) | undefined;
const disconnect = vi.fn();

function setVisible(isIntersecting: boolean) {
  act(() => observerCallback?.([{ isIntersecting }]));
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  reduced = false;
  observerCallback = undefined;
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({ matches: reduced && query.includes("reduce"), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        observerCallback = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  document.documentElement.removeAttribute("data-lite");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Lottie", () => {
  it("reserves the aspect ratio and hides the drawing from assistive technology", () => {
    const { container } = render(<Lottie id="welcome" labels={labels} />);
    const stage = container.firstElementChild as HTMLElement;
    expect(stage.style.aspectRatio).toBe(`${motionMeta.welcome.width} / ${motionMeta.welcome.height}`);
    expect(stage.dataset.decorative).toBe("true");
    expect(stage.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it("loads the light SVG player lazily and plays only while visible", async () => {
    render(<Lottie id="flow-loop" labels={labels} />);
    await flush();
    expect(loadPlayer).toHaveBeenCalledWith(expect.objectContaining({ renderer: "svg", autoplay: false, loop: true }));
    expect(player.play).not.toHaveBeenCalled();
    setVisible(true);
    expect(player.play).toHaveBeenCalledTimes(1);
    setVisible(false);
    expect(player.pause).toHaveBeenCalled();
  });

  it("offers a 48 px pause and play button for looping animations", async () => {
    render(<Lottie id="flow-loop" labels={labels} />);
    await flush();
    setVisible(true);
    const button = screen.getByRole("button", { name: "Pause animation" });
    fireEvent.click(button);
    expect(player.pause).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Play animation" })).toBeTruthy();
    player.play.mockClear();
    setVisible(true);
    expect(player.play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Play animation" }));
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it("plays a playOnce animation without a control and without looping", async () => {
    render(<Lottie id="welcome" labels={labels} playOnce />);
    await flush();
    expect(loadPlayer).toHaveBeenCalledWith(expect.objectContaining({ loop: false }));
    expect(screen.queryByRole("button")).toBeNull();
    const complete = player.addEventListener.mock.calls.find(([name]) => name === "complete")?.[1] as () => void;
    setVisible(true);
    complete();
    player.play.mockClear();
    setVisible(false);
    setVisible(true);
    expect(player.play).not.toHaveBeenCalled();
  });

  it("shows the poster frame and never plays with reduced motion", async () => {
    reduced = true;
    render(<Lottie id="machine-cost" labels={labels} />);
    await flush();
    expect(player.goToAndStop).toHaveBeenCalledWith(motionMeta["machine-cost"].posterFrame, true);
    expect(player.play).not.toHaveBeenCalled();
    expect(observerCallback).toBeUndefined();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("waits for lite mode to end before loading", async () => {
    document.documentElement.setAttribute("data-lite", "on");
    render(<Lottie id="flow-loop" labels={labels} />);
    await flush();
    expect(loadPlayer).not.toHaveBeenCalled();
    document.documentElement.setAttribute("data-lite", "off");
    await flush();
    expect(loadPlayer).toHaveBeenCalledTimes(1);
  });

  it("destroys the player on unmount", async () => {
    const { unmount } = render(<Lottie id="flow-loop" labels={labels} />);
    await flush();
    unmount();
    expect(player.destroy).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalled();
  });
});

describe("needsPauseControl", () => {
  it("asks for a control when an animation loops or runs past five seconds", () => {
    expect(needsPauseControl(true, 4000)).toBe(true);
    expect(needsPauseControl(false, 6000)).toBe(true);
    expect(needsPauseControl(false, 4000)).toBe(false);
  });
});
