// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ApiModule from "@/lib/api";

import type { AttentionItemDTO } from "@agrorende/core/modules/ops/dto";

import { intlErrors, renderWithProviders } from "@/features/ops/testing";

import { AttentionPage } from "./AttentionPage";

const apiMock = vi.hoisted(() => ({ items: [] as unknown[], resolve: vi.fn(), listCalls: 0 }));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/attention",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return {
    ...actual,
    api: vi.fn((path: string, request: { method?: string; body?: unknown } = {}) => {
      if (path === "/attention") {
        apiMock.listCalls += 1;
        return Promise.resolve({ items: apiMock.items });
      }
      if (request.method === "POST") return apiMock.resolve(path, request.body, actual.ApiError) as Promise<unknown>;
      return Promise.reject(new actual.ApiError({ code: "NOT_FOUND", status: 404 }));
    }),
  };
});

const item: AttentionItemDTO = {
  kind: "REJECTED_MUTATION",
  id: "mut-1",
  at: "2025-03-10T12:00:00.000Z",
  userId: "u-1",
  userName: "Ana Souza",
  deviceId: "dev-1",
  params: { name: "workOrders.complete", code: "STALE_STATE", ref: "ref-123" },
};

describe("AttentionPage", () => {
  beforeEach(() => {
    apiMock.items = [item];
    apiMock.resolve.mockReset();
    apiMock.listCalls = 0;
    toastMock.success.mockClear();
    intlErrors.length = 0;
  });

  afterEach(() => {
    cleanup();
    expect(intlErrors).toEqual([]);
  });

  it("requires a note before resolving and keeps the item open", async () => {
    renderWithProviders(<AttentionPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Resolve" }));
    await userEvent.click(screen.getByRole("button", { name: "Save and resolve" }));
    expect(screen.getByText("Add how this was resolved. Nothing was closed yet.")).toBeTruthy();
    expect(document.activeElement?.tagName).toBe("TEXTAREA");
    expect(apiMock.resolve).not.toHaveBeenCalled();
  });

  it("resolves with a note and refreshes the queue", async () => {
    apiMock.resolve.mockResolvedValue({ kind: item.kind, id: item.id, resolvedAt: "2025-03-10T13:00:00.000Z", resolvedById: "me", resolverName: "Me", note: "Retried" });
    renderWithProviders(<AttentionPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Resolve" }));
    await userEvent.type(screen.getByRole("textbox"), "Retried on the phone");
    await userEvent.click(screen.getByRole("button", { name: "Save and resolve" }));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledTimes(1));
    expect(apiMock.resolve).toHaveBeenCalledWith("/attention/REJECTED_MUTATION/mut-1/resolve", { note: "Retried on the phone" }, expect.anything());
    await waitFor(() => expect(apiMock.listCalls).toBeGreaterThan(1));
  });

  it("shows who resolved it first, with their note, when a colleague won the race", async () => {
    apiMock.resolve.mockImplementation((_path: string, _body: unknown, ApiError: typeof ApiModule.ApiError) =>
      Promise.reject(new ApiError({ code: "ALREADY_RESOLVED", status: 409, details: { resolverName: "Bruno Lima", resolvedAt: "2025-03-10T12:30:00.000Z", note: "Fixed the clock on the phone" } })),
    );
    renderWithProviders(<AttentionPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Resolve" }));
    await userEvent.type(screen.getByRole("textbox"), "Me too");
    apiMock.items = [];
    await userEvent.click(screen.getByRole("button", { name: "Save and resolve" }));
    expect(await screen.findByText("This item was already resolved")).toBeTruthy();
    expect(screen.getByText(/Resolved by Bruno Lima at/u)).toBeTruthy();
    expect(screen.getByText("Fixed the clock on the phone")).toBeTruthy();
    expect(toastMock.success).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Resolve" })).toBeNull());
  });

  it("links a rejected change to the phone health and the team member", async () => {
    renderWithProviders(<AttentionPage />);
    expect((await screen.findByRole("link", { name: /Open phone health/u })).getAttribute("href")).toBe("/team/devices?device=dev-1");
    expect(screen.getByRole("link", { name: /Open team member/u }).getAttribute("href")).toBe("/team/u-1");
    expect(screen.getByText('Ana Souza: change "workOrders.complete" was not accepted')).toBeTruthy();
  });
});
