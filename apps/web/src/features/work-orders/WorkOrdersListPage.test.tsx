// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ApiModule from "@/lib/api";

import { intlErrors, renderWithProviders } from "@/features/ops/testing";

import type { WorkOrderListItem } from "./types";
import { WorkOrdersListPage } from "./WorkOrdersListPage";

/** A tiny URL store, so `useUrlState` writes behave like the real router: replace, then re-render with the new search. */
const nav = vi.hoisted(() => {
  let search = "";
  const listeners = new Set<() => void>();
  return {
    get: () => search,
    set: (next: string) => {
      search = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
});
const apiMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useRouter: () => ({ push: vi.fn(), replace: (url: string) => nav.set(url.split("?")[1] ?? ""), refresh: vi.fn() }),
    usePathname: () => "/work-orders",
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(nav.subscribe, nav.get)),
  };
});
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof ApiModule>()), api: apiMock }));

function workOrder(id: string, number: string, title: string): WorkOrderListItem {
  return { id, number, title, priority: "MEDIUM", status: "OPEN", sla: "NONE", hasLateEvidence: false, dueAt: null, assetCode: null, assetName: null, assigneeName: null, siteName: null } as unknown as WorkOrderListItem;
}

const PUMP = workOrder("w1", "WO-0001", "Trocar bomba hidráulica");
const FILTER = workOrder("w2", "WO-0002", "Trocar filtro de ar");

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function workOrderCalls(): { readonly q?: string; readonly limit?: number }[] {
  return apiMock.mock.calls.filter(([path]) => path === "/work-orders").map(([, init]) => (init as { readonly query: { readonly q?: string; readonly limit?: number } }).query);
}

beforeEach(() => {
  intlErrors.length = 0;
  apiMock.mockReset();
  apiMock.mockImplementation((path: string) => Promise.resolve(path === "/work-orders" ? { items: [PUMP, FILTER], nextCursor: null } : { items: [], nextCursor: null }));
});

afterEach(() => {
  cleanup();
  act(() => nav.set(""));
});

describe("WorkOrdersListPage filters", () => {
  it("fetches once per pause in typing and keeps the old rows dimmed until the new page arrives", async () => {
    nav.set("view=table");
    renderWithProviders(<WorkOrdersListPage />);
    await screen.findByText("Trocar bomba hidráulica");
    expect(workOrderCalls()).toHaveLength(1);

    const next = deferred<{ items: WorkOrderListItem[]; nextCursor: null }>();
    apiMock.mockImplementation((path: string) => (path === "/work-orders" ? next.promise : Promise.resolve({ items: [], nextCursor: null })));
    const search = screen.getByRole("searchbox", { name: "Search" });
    for (const text of ["b", "bo", "bom", "bomb", "bomba"]) fireEvent.change(search, { target: { value: text } });
    expect(workOrderCalls()).toHaveLength(1);

    await waitFor(() => expect(workOrderCalls()).toHaveLength(2));
    expect(workOrderCalls()[1]?.q).toBe("bomba");
    expect(nav.get()).toContain("q=bomba");
    // Old rows stay on screen, dimmed and busy, while the filtered page loads.
    expect(screen.getByText("Trocar filtro de ar")).toBeTruthy();
    const frame = screen.getByTestId("refreshing-frame");
    expect(frame.getAttribute("aria-busy")).toBe("true");
    expect(frame.className).toContain("opacity-60");

    await act(async () => {
      next.resolve({ items: [PUMP], nextCursor: null });
      await next.promise;
    });
    await waitFor(() => expect(screen.queryByText("Trocar filtro de ar")).toBeNull());
    expect(screen.getByTestId("refreshing-frame").hasAttribute("aria-busy")).toBe(false);
    expect(screen.getByTestId("filter-bar-count").textContent).toBe("1 result");
    await new Promise((r) => setTimeout(r, 400));
    expect(workOrderCalls()).toHaveLength(2);
    expect(intlErrors).toEqual([]);
  });

  it("does not carry the board's rows into the table while the table loads", async () => {
    renderWithProviders(<WorkOrdersListPage />);
    await screen.findByText("Trocar bomba hidráulica");
    expect(workOrderCalls()[0]?.limit).toBe(200);

    const table = deferred<{ items: WorkOrderListItem[]; nextCursor: string }>();
    apiMock.mockImplementation((path: string) => (path === "/work-orders" ? table.promise : Promise.resolve({ items: [], nextCursor: null })));
    await userEvent.click(screen.getByRole("button", { name: "Table" }));
    await waitFor(() => expect(workOrderCalls()).toHaveLength(2));
    expect(workOrderCalls()[1]?.limit).toBe(50);
    expect(screen.getByTestId("table-loading")).toBeTruthy();
    expect(screen.queryByText("Trocar bomba hidráulica")).toBeNull();
    expect(screen.getByTestId("filter-bar-count").className).toContain("invisible");

    await act(async () => {
      table.resolve({ items: [FILTER], nextCursor: "c2" });
      await table.promise;
    });
    expect(await screen.findByText("Trocar filtro de ar")).toBeTruthy();
    expect(screen.getByTestId("filter-bar-count").textContent).toBe("1+ results");
    expect(intlErrors).toEqual([]);
  });
});
