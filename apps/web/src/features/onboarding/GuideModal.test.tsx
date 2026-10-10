// @vitest-environment jsdom
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ApiModule from "@/lib/api";
import { intlErrors, renderWithProviders } from "@/features/ops/testing";

import { UserMenu } from "@/features/shell/UserMenu";

import { GettingStartedRoute } from "./GettingStartedRoute";
import { GuideModalProvider, useGuideModal } from "./GuideModal";
import { GuideProgressCard } from "./GuideProgressCard";
import { guideStorageKey } from "./guideStorage";

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const me = vi.hoisted(() => ({ role: "ADMIN" as string }));
const server = vi.hoisted(() => ({
  steps: [] as { id: string; completed: boolean }[],
  workOrders: [] as { id: string }[],
  calls: [] as { path: string; method: string; body: unknown }[],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace, refresh: vi.fn() }),
  usePathname: () => "/getting-started",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/motion/Lottie", () => ({ Lottie: ({ id }: { id: string }) => <div data-animation={id} data-testid="lottie" /> }));
vi.mock("@/features/shell/useMe", () => ({
  useMe: () => ({ isLoading: false, error: null, refetch: vi.fn(), data: { user: { id: "u1", name: "Ana Souza", role: me.role }, org: { id: "org1", name: "Fazenda Boa Vista" } } }),
}));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return {
    ...actual,
    api: vi.fn((path: string, options: { method?: string; body?: unknown } = {}) => {
      const method = options.method ?? "GET";
      server.calls.push({ path, method, body: options.body });
      if (path === "/org/subscription") return Promise.resolve({ gettingStarted: { steps: server.steps, completed: false, dismissedAt: null } });
      if (path === "/work-orders" && method === "GET") return Promise.resolve({ items: server.workOrders, nextCursor: null });
      if (path === "/assets" && method === "GET") return Promise.resolve({ items: [{ id: "asset-9", name: "Colheitadeira", code: "C-9" }], nextCursor: null });
      if (path === "/assets") return Promise.resolve({ id: "asset-1", name: (options.body as { name: string }).name });
      if (path === "/users") return Promise.resolve({ user: { id: "u2", name: "João" }, invite: { code: "ABC123", url: "https://app.agrorende.dev/i/ABC123" } });
      if (path === "/work-orders") return Promise.resolve({ id: "wo-1" });
      return Promise.reject(new actual.ApiError({ code: "NOT_FOUND", status: 404 }));
    }),
  };
});

vi.mock("@/features/shell/LanguageSwitch", () => ({ LanguageSwitch: () => <select aria-label="Language" /> }));

const KEY = guideStorageKey("org1");
const stored = () => JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
const animate = vi.fn();
let reduced = false;

function modal(): HTMLDialogElement {
  return screen.getByTestId("guide-modal") as HTMLDialogElement;
}

function Opener() {
  const guide = useGuideModal();
  return (
    <button onClick={() => guide?.open()} type="button">
      open guide
    </button>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  me.role = "ADMIN";
  reduced = false;
  server.steps = [
    { id: "assets", completed: true },
    { id: "team", completed: false },
    { id: "qr", completed: false },
    { id: "app", completed: false },
  ];
  server.workOrders = [];
  server.calls = [];
  intlErrors.length = 0;
  // jsdom has no modal dialogs or Web Animations; model the parts the modal relies on.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
  Element.prototype.animate = function fakeAnimate(this: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    animate(this, keyframes, options);
    const animation = { onfinish: null as null | (() => void), cancel: vi.fn() };
    window.setTimeout(() => animation.onfinish?.(), 0);
    return animation as unknown as Animation;
  } as Element["animate"];
  window.matchMedia = vi.fn((query: string) => ({ matches: query.includes("reduce") ? reduced : false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("GuideModal", () => {
  it("opens by itself once for a brand-new organisation", async () => {
    server.steps = server.steps.map((step) => ({ ...step, completed: false }));
    renderWithProviders(<GuideModalProvider>page</GuideModalProvider>);
    await waitFor(() => expect(modal().open).toBe(true));
    expect(modal().getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("dialog", { name: "Getting started" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Welcome to AgroRende, Ana" })).toBeTruthy();
    expect(stored()).toMatchObject({ offered: true });
    cleanup();
    renderWithProviders(<GuideModalProvider>page</GuideModalProvider>);
    await waitFor(() => expect(server.calls.filter((call) => call.path === "/org/subscription").length).toBeGreaterThan(1));
    expect(modal().open).toBe(false);
  });

  it("does not open by itself when the organisation already has machines", async () => {
    renderWithProviders(<GuideModalProvider>page</GuideModalProvider>);
    await waitFor(() => expect(server.calls.some((call) => call.path === "/org/subscription")).toBe(true));
    expect(modal().open).toBe(false);
  });

  it("re-opens from the user menu, closes on Escape and gives focus back to the menu button", async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ step: "welcome", offered: true }));
    renderWithProviders(
      <GuideModalProvider>
        <UserMenu name="Ana" roleLabel="Admin" showGuide />
      </GuideModalProvider>,
    );
    const trigger = screen.getByRole("button", { name: /Ana/ });
    await userEvent.click(trigger);
    expect(screen.getByTestId("user-menu-guide").tagName).toBe("BUTTON");
    await userEvent.click(screen.getByTestId("user-menu-guide"));
    await waitFor(() => expect(modal().open).toBe(true));
    expect(await screen.findByRole("heading", { name: "Welcome to AgroRende, Ana" })).toBeTruthy();

    act(() => {
      modal().dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    await waitFor(() => expect(modal().open).toBe(false));
    expect(document.activeElement).toBe(trigger);
  });

  it("closes from the X and from Continue later", async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ step: "welcome", offered: true }));
    renderWithProviders(
      <GuideModalProvider>
        <Opener />
      </GuideModalProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "open guide" }));
    await waitFor(() => expect(modal().open).toBe(true));
    await userEvent.click(screen.getByTestId("guide-modal-close"));
    await waitFor(() => expect(modal().open).toBe(false));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "open guide" }));

    await userEvent.click(screen.getByRole("button", { name: "open guide" }));
    await waitFor(() => expect(modal().open).toBe(true));
    await userEvent.click(screen.getByRole("button", { name: "Continue later" }));
    await waitFor(() => expect(modal().open).toBe(false));
  });

  it("slides forward and back between steps and keeps the place for the overview card", async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ step: "welcome", offered: true }));
    renderWithProviders(
      <GuideModalProvider>
        <Opener />
        <GuideProgressCard />
      </GuideModalProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "open guide" }));
    await screen.findByRole("heading", { name: "Welcome to AgroRende, Ana" });
    animate.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByRole("heading", { name: "Add your first machine" })).toBeTruthy();
    const panel = screen.getByTestId("guide-step-panel");
    const slide = animate.mock.calls.find(([element]) => element === panel);
    expect(slide?.[1]).toEqual([
      { opacity: 0, transform: "translateX(32px)" },
      { opacity: 1, transform: "translateX(0)" },
    ]);
    animate.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(animate.mock.calls.find(([element]) => element === screen.getByTestId("guide-step-panel"))?.[1][0]).toEqual({ opacity: 0, transform: "translateX(-32px)" });
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(stored()).toMatchObject({ step: "machine" });

    // Leaving through a link closes the modal; the card's continue button opens it again where it was.
    await userEvent.click(screen.getByRole("link", { name: "More details" }));
    await waitFor(() => expect(modal().open).toBe(false));
    await userEvent.click(await screen.findByTestId("guide-card-open"));
    expect(await screen.findByRole("heading", { name: "Add your first machine" })).toBeTruthy();
  });

  it("only fades when the user prefers reduced motion", async () => {
    reduced = true;
    window.localStorage.setItem(KEY, JSON.stringify({ step: "welcome", offered: true }));
    renderWithProviders(
      <GuideModalProvider>
        <Opener />
      </GuideModalProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "open guide" }));
    await screen.findByRole("heading", { name: "Welcome to AgroRende, Ana" });
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(animate.mock.calls.length).toBeGreaterThan(0);
    for (const [, keyframes] of animate.mock.calls as [Element, Keyframe[]][]) {
      for (const frame of keyframes) expect(frame.transform).toBeUndefined();
    }
  });

  it("turns the /getting-started deep link into the modal over the overview", async () => {
    renderWithProviders(
      <GuideModalProvider>
        <GettingStartedRoute />
      </GuideModalProvider>,
    );
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/ops"));
    await waitFor(() => expect(modal().open).toBe(true));
  });

  it("keeps the page for roles without the guide", async () => {
    me.role = "MANAGER";
    renderWithProviders(
      <GuideModalProvider>
        <GettingStartedRoute />
      </GuideModalProvider>,
    );
    expect(await screen.findByRole("link", { name: "Go to the overview" })).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalled();
    expect(screen.queryByTestId("guide-modal")).toBeNull();
  });
});
