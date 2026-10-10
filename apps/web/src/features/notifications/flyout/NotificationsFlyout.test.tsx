// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/features/ops/testing";
import type * as ApiModule from "@/lib/api";

import { NotificationsFlyout } from "./NotificationsFlyout";
import { formatRelativeTime } from "./relativeTime";

const push = vi.hoisted(() => vi.fn());
const apiMock = vi.hoisted(() => ({
  items: [] as Record<string, unknown>[],
  fail: false,
  posts: [] as unknown[],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/ops",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/motion/Lottie", () => ({ Lottie: () => <div data-testid="lottie-empty" /> }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return {
    ...actual,
    api: vi.fn((path: string, request: { method?: string; body?: unknown; query?: Record<string, unknown> } = {}) => {
      if (request.method === "POST") {
        apiMock.posts.push(request.body);
        return Promise.resolve({ ok: true });
      }
      if (path === "/notifications" && request.query?.unread === true) {
        return Promise.resolve({ items: apiMock.items.filter((n) => n.readAt === null), nextCursor: null });
      }
      if (path === "/notifications") {
        if (apiMock.fail) return Promise.reject(new actual.ApiError({ code: "INTERNAL", status: 500 }));
        return Promise.resolve({ items: apiMock.items, nextCursor: null });
      }
      return Promise.reject(new actual.ApiError({ code: "NOT_FOUND", status: 404 }));
    }),
  };
});

const NOW = new Date().toISOString();
function notification(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    orgId: "org",
    userId: "u1",
    type: "WO_ASSIGNED",
    title: `Title ${id}`,
    body: `Body ${id}`,
    entityType: "WORK_ORDER",
    entityId: "018fd000-0000-7000-8000-000000001111",
    readAt: null,
    pushedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
    ...overrides,
  };
}

beforeEach(() => {
  apiMock.items = [notification("n1"), notification("n2", { readAt: NOW, type: "LOW_STOCK", entityType: null, entityId: null })];
  apiMock.fail = false;
  apiMock.posts = [];
  push.mockReset();
});
afterEach(cleanup);

describe("NotificationsFlyout", () => {
  it("opens a labelled dialog anchored to the bell instead of navigating, and closes with Escape returning focus", async () => {
    renderWithProviders(<NotificationsFlyout />);
    const bell = screen.getByTestId("notifications-bell");
    expect(bell.getAttribute("aria-expanded")).toBe("false");
    await waitFor(() => expect(bell.getAttribute("aria-label")).toBe("Notifications, 1 unread"));

    await userEvent.click(bell);
    const dialog = screen.getByRole("dialog", { name: "Notifications" });
    expect(bell.getAttribute("aria-expanded")).toBe("true");
    expect(bell.getAttribute("aria-controls")).toBe(dialog.id);
    expect(document.activeElement).toBe(dialog);
    expect(push).not.toHaveBeenCalled();
    expect(await within(dialog).findAllByTestId("flyout-row")).toHaveLength(2);
    expect(within(dialog).getByTestId("flyout-unread").textContent).toBe("1 unread");
    expect(within(dialog).getByRole("link", { name: "See all notifications" }).getAttribute("href")).toBe("/notifications");

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(bell);
  });

  it("closes when the user clicks outside", async () => {
    renderWithProviders(
      <div>
        <p>outside</p>
        <NotificationsFlyout />
      </div>,
    );
    await userEvent.click(screen.getByTestId("notifications-bell"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    await userEvent.click(screen.getByText("outside"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("marks an unread row read and opens the related record", async () => {
    renderWithProviders(<NotificationsFlyout />);
    await userEvent.click(screen.getByTestId("notifications-bell"));
    const rows = await screen.findAllByTestId("flyout-row");
    expect(rows[0]?.getAttribute("data-unread")).toBe("true");
    await userEvent.click(rows[0] as HTMLElement);
    await waitFor(() => expect(apiMock.posts).toEqual([{ ids: ["n1"] }]));
    expect(push).toHaveBeenCalledWith("/work-orders/018fd000-0000-7000-8000-000000001111");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not mark a read row again and stays put when the row has no link", async () => {
    renderWithProviders(<NotificationsFlyout />);
    await userEvent.click(screen.getByTestId("notifications-bell"));
    const rows = await screen.findAllByTestId("flyout-row");
    await userEvent.click(rows[1] as HTMLElement);
    expect(apiMock.posts).toEqual([]);
    expect(push).not.toHaveBeenCalled();
  });

  it("marks everything read", async () => {
    renderWithProviders(<NotificationsFlyout />);
    await userEvent.click(screen.getByTestId("notifications-bell"));
    await userEvent.click(await screen.findByRole("button", { name: "Mark all as read" }));
    await waitFor(() => expect(apiMock.posts).toEqual([{ all: true }]));
  });

  it("shows the empty state and the error state with a retry", async () => {
    apiMock.items = [];
    renderWithProviders(<NotificationsFlyout />);
    await userEvent.click(screen.getByTestId("notifications-bell"));
    expect(await screen.findByTestId("lottie-empty")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mark all as read" })).toBeNull();
    cleanup();

    apiMock.fail = true;
    apiMock.items = [notification("n1"), notification("n2", { readAt: NOW })];
    renderWithProviders(<NotificationsFlyout />);
    await userEvent.click(screen.getByTestId("notifications-bell"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    apiMock.fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findAllByTestId("flyout-row")).toHaveLength(2);
  });
});

describe("formatRelativeTime", () => {
  it("formats short relative times in the user's language", () => {
    const now = Date.parse("2026-05-01T12:00:00Z");
    expect(formatRelativeTime("2026-05-01T10:00:00Z", "pt-BR", now)).toBe("há 2 h");
    expect(formatRelativeTime("2026-05-01T10:00:00Z", "en", now)).toBe("2 hr. ago");
  });
});
