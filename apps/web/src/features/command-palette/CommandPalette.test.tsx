// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ApiModule from "@/lib/api";

import { intlErrors, renderWithProviders } from "@/features/ops/testing";

import { CommandPalette, isPaletteShortcut, openCommandPalette } from ".";

const router = vi.hoisted(() => ({ push: vi.fn() }));
const apiMock = vi.hoisted(() => ({ queries: [] as string[], fail: false }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: router.push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/ops",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return {
    ...actual,
    api: vi.fn((path: string, request: { query?: { q?: string } } = {}) => {
      if (path === "/auth/me")
        return Promise.resolve({ user: { id: "u1", name: "Ana", role: "MANAGER" } });
      if (path === "/search") {
        const q = request.query?.q ?? "";
        apiMock.queries.push(q);
        if (apiMock.fail)
          return Promise.reject(
            new actual.ApiError({ code: "INTERNAL", status: 500, retryable: true }),
          );
        const hit = (
          type: string,
          id: string,
          title: string,
          href: string,
          subtitle: string | null = null,
        ) => ({ id, type, title, subtitle, href });
        return Promise.resolve({
          q,
          tookMs: 4,
          assets: [hit("assets", "a1", "TR-01 · Trator 7200", "/assets/a1", "ABC1D23")],
          fieldReports: [],
          workOrders: [
            hit("workOrders", "w1", "OS-0042 · Trator 7200 sem força", "/work-orders/w1", "OPEN"),
          ],
          rentals: [],
          customers: [],
          sites: [],
        });
      }
      return Promise.resolve({ items: [], nextCursor: null });
    }),
  };
});

beforeAll(() => {
  // jsdom has no modal dialogs. Like browsers, showModal() focuses the first focusable control
  // (the close button), which the palette must override so typing goes to the search box.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
    this.querySelector<HTMLElement>("button, input")?.focus();
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
  Element.prototype.scrollIntoView = () => undefined;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

describe("CommandPalette", () => {
  beforeEach(() => {
    router.push.mockClear();
    apiMock.queries.length = 0;
    apiMock.fail = false;
    intlErrors.length = 0;
  });

  afterEach(() => {
    cleanup();
    expect(intlErrors).toEqual([]);
  });

  it("recognises Cmd+K, Ctrl+K and / outside text fields", () => {
    const input = document.createElement("input");
    expect(
      isPaletteShortcut({
        key: "k",
        metaKey: true,
        ctrlKey: false,
        altKey: false,
        target: document.body,
      }),
    ).toBe(true);
    expect(
      isPaletteShortcut({ key: "K", metaKey: false, ctrlKey: true, altKey: false, target: input }),
    ).toBe(true);
    expect(
      isPaletteShortcut({
        key: "/",
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        target: document.body,
      }),
    ).toBe(true);
    expect(
      isPaletteShortcut({ key: "/", metaKey: false, ctrlKey: false, altKey: false, target: input }),
    ).toBe(false);
    expect(
      isPaletteShortcut({
        key: "k",
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        target: document.body,
      }),
    ).toBe(false);
  });

  it("stays closed until Ctrl+K, then searches records and opens the chosen one with the keyboard only", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<CommandPalette />);
    expect(container.innerHTML).toBe("");

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = await screen.findByRole("combobox");
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(screen.getByText("Go to Operations")).toBeTruthy();
    expect(screen.queryByText("Go to Seasons")).toBeNull();

    await user.type(input, "trator");
    expect(await screen.findByText("TR-01 · Trator 7200")).toBeTruthy();
    expect(screen.getByText("OS-0042 · Trator 7200 sem força")).toBeTruthy();
    expect(screen.queryByText("OPEN")).toBeNull();
    expect(apiMock.queries).toEqual(["trator"]);

    await user.keyboard("{ArrowDown}{Enter}");
    expect(router.push).toHaveBeenCalledWith("/work-orders/w1");
    await waitFor(() => expect(screen.queryByRole("combobox")).toBeNull());
  });

  it("filters quick actions and pages by accent-insensitive text", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CommandPalette />, { locale: "pt-BR" });
    act(() => openCommandPalette());
    const input = await screen.findByRole("combobox");
    await user.type(input, "locac");
    expect(await screen.findByText("Nova locação")).toBeTruthy();
    expect(screen.getByText("Ir para Locações")).toBeTruthy();
    expect(screen.queryByText("Nova ordem de serviço")).toBeNull();
    await user.keyboard("{Enter}");
    expect(router.push).toHaveBeenCalledWith("/rentals/new");
  });

  it("asks for two characters, reports failures with a retry and closes on Escape", async () => {
    const user = userEvent.setup();
    apiMock.fail = true;
    renderWithProviders(<CommandPalette />);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const input = await screen.findByRole("combobox");
    await user.type(input, "t");
    expect(screen.getByText("Type at least 2 characters to search records.")).toBeTruthy();
    await user.type(input, "r");
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    await waitFor(() => expect(screen.queryByRole("combobox")).toBeNull());
  });
});
