// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ApiModule from "@/lib/api";
import { intlErrors, renderWithProviders } from "@/features/ops/testing";

import { GuidePage } from "./GuidePage";
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

const KEY = guideStorageKey("org1");
const posts = (path: string) => server.calls.filter((call) => call.path === path && call.method === "POST");
const stored = () => JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  me.role = "ADMIN";
  server.steps = [
    { id: "assets", completed: false },
    { id: "team", completed: false },
    { id: "qr", completed: false },
    { id: "app", completed: false },
  ];
  server.workOrders = [];
  server.calls = [];
  intlErrors.length = 0;
  window.scrollTo = vi.fn();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("GuidePage", () => {
  it("walks from the welcome to a quick machine and remembers it for the work order", async () => {
    renderWithProviders(<GuidePage />);
    expect(await screen.findByRole("heading", { name: "Welcome to AgroRende, Ana" })).toBeTruthy();
    expect(screen.getByText("Step 1 of 5")).toBeTruthy();
    expect(screen.getByTestId("lottie").getAttribute("data-animation")).toBe("welcome");

    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByRole("heading", { name: "Add your first machine" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "More details" }).getAttribute("href")).toBe("/assets/new");
    await userEvent.type(screen.getByLabelText(/Machine name/u), "Trator 6110J");
    await userEvent.selectOptions(screen.getByLabelText(/Type/u), "HARVESTER");
    await userEvent.click(screen.getByRole("button", { name: "Save machine" }));

    await screen.findByRole("heading", { name: "Invite a technician" });
    expect(posts("/assets")[0]?.body).toMatchObject({ name: "Trator 6110J", category: "HARVESTER" });
    expect(stored()).toMatchObject({ step: "team", assetId: "asset-1", assetName: "Trator 6110J" });
    expect(intlErrors).toEqual([]);
  });

  it("invites one technician and offers the WhatsApp share", async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ step: "team" }));
    renderWithProviders(<GuidePage />);
    await userEvent.type(await screen.findByLabelText(/Technician's name/u), "João");
    await userEvent.click(screen.getByRole("button", { name: "Create invite" }));

    expect(await screen.findByRole("heading", { name: "Invite for João created" })).toBeTruthy();
    expect(posts("/users")[0]?.body).toEqual({ name: "João", role: "FIELD" });
    expect(screen.getByTestId("share-whatsapp").getAttribute("href")).toMatch(/^https:\/\/wa\.me\/\?text=/u);
    expect(screen.getByText("ABC123")).toBeTruthy();
  });

  it("pre-fills the first work order with the machine from step 2", async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ step: "workOrder", assetId: "asset-9", assetName: "Colheitadeira" }));
    renderWithProviders(<GuidePage />);
    expect(await screen.findByRole("heading", { name: "Open the first work order" })).toBeTruthy();
    expect((screen.getByLabelText(/What needs doing/u) as HTMLInputElement).value).toBe("General service");
    await userEvent.click(screen.getByRole("button", { name: "Create work order" }));

    expect(await screen.findByRole("heading", { name: "All set to start" })).toBeTruthy();
    expect(posts("/work-orders")[0]?.body).toMatchObject({ title: "General service", assetId: "asset-9" });
    expect(stored()).toMatchObject({ step: "done", workOrderId: "wo-1" });
  });

  it("lets the admin skip any step and resume where they left off", async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ step: "machine" }));
    renderWithProviders(<GuidePage />);
    await screen.findByRole("heading", { name: "Add your first machine" });
    await userEvent.click(screen.getByRole("button", { name: "Skip this step" }));
    expect(screen.getByRole("heading", { name: "Invite a technician" })).toBeTruthy();
    expect(stored()).toMatchObject({ step: "team" });
    expect(screen.getByRole("button", { name: /Invite the team/u }).getAttribute("aria-current")).toBe("step");
  });

  it("marks the guide finished from the last step", async () => {
    server.steps = server.steps.map((step) => ({ ...step, completed: step.id === "assets" }));
    window.localStorage.setItem(KEY, JSON.stringify({ step: "done" }));
    renderWithProviders(<GuidePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Go to the overview" }));
    expect(stored()).toMatchObject({ finished: true });
    expect(nav.push).toHaveBeenCalledWith("/ops");
  });

  it("explains that only admins can use the guide", async () => {
    me.role = "MANAGER";
    renderWithProviders(<GuidePage />);
    expect(await screen.findByRole("link", { name: "Go to the overview" })).toBeTruthy();
    expect(server.calls.some((call) => call.path === "/org/subscription")).toBe(false);
  });
});

describe("GuideProgressCard", () => {
  it("shows the real progress with a continue button and can be hidden", async () => {
    server.steps = server.steps.map((step) => ({ ...step, completed: step.id === "assets" }));
    server.workOrders = [{ id: "wo-1" }];
    renderWithProviders(<GuideProgressCard />);
    expect(await screen.findByRole("heading", { name: "Getting started" })).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("2");
    expect(screen.getByText("2 of 4 tasks")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Continue" }).getAttribute("href")).toBe("/getting-started");
    expect(nav.replace).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByTestId("guide-progress-card")).toBeNull();
    expect(stored()).toMatchObject({ dismissed: true });
  });

  it("opens the guide once for a brand-new organisation", async () => {
    renderWithProviders(<GuideProgressCard />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/getting-started"));
    expect(stored()).toMatchObject({ offered: true });
    cleanup();
    nav.replace.mockClear();
    renderWithProviders(<GuideProgressCard />);
    await screen.findByTestId("guide-progress-card");
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("stays hidden for non-admins and once everything is done", async () => {
    me.role = "MANAGER";
    const { unmount } = renderWithProviders(<GuideProgressCard />);
    expect(screen.queryByTestId("guide-progress-card")).toBeNull();
    unmount();
    me.role = "ADMIN";
    server.steps = server.steps.map((step) => ({ ...step, completed: true }));
    server.workOrders = [{ id: "wo-1" }];
    renderWithProviders(<GuideProgressCard />);
    await waitFor(() => expect(server.calls.filter((call) => call.path === "/work-orders").length).toBeGreaterThan(0));
    expect(screen.queryByTestId("guide-progress-card")).toBeNull();
  });
});
