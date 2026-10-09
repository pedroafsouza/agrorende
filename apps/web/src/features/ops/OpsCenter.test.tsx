// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { forwardRef, useImperativeHandle, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ApiModule from "@/lib/api";

import { OpsCenter } from "./OpsCenter";
import { OperatorStore } from "./operatorStore";
import { intlErrors, renderWithProviders } from "./testing";
import type { LiveOperatorDTO, OpsAlertDTO, OpsLiveDTO } from "./types";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), search: "" }));
const mapMock = vi.hoisted(() => ({ setData: vi.fn() }));
const apiMock = vi.hoisted(() => ({ responses: new Map<string, unknown>(), calls: [] as string[] }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/ops",
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

/*
 * The Ops Center listens on the shared admin socket (`useRealtimeEvent` / `useRealtimeStatus`);
 * this fake stands in for it so a test can drive connection state and server events.
 */
const realtimeMock = vi.hoisted(() => ({
  handlers: new Map<string, Set<(payload: unknown) => void>>(),
  listeners: new Set<() => void>(),
  status: { state: "connecting" as "connecting" | "connected" | "reconnecting" | "offline", lastMessageAt: null as Date | null, reconnectCount: 0 },
}));

vi.mock("@/features/shell/useRealtime", async () => {
  const { useEffect, useRef, useSyncExternalStore } = await import("react");
  return {
    useRealtimeEvent: (event: string, handler: (payload: unknown) => void) => {
      const latest = useRef(handler);
      useEffect(() => {
        latest.current = handler;
      });
      useEffect(() => {
        const wrapped = (payload: unknown) => latest.current(payload);
        const set = realtimeMock.handlers.get(event) ?? new Set();
        set.add(wrapped);
        realtimeMock.handlers.set(event, set);
        return () => {
          set.delete(wrapped);
        };
      }, [event]);
    },
    useRealtimeStatus: () =>
      useSyncExternalStore(
        (listener: () => void) => {
          realtimeMock.listeners.add(listener);
          return () => realtimeMock.listeners.delete(listener);
        },
        () => realtimeMock.status,
        () => realtimeMock.status,
      ),
  };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("react-map-gl/maplibre", () => {
  interface FakeMapProps {
    readonly children?: ReactNode;
    readonly onError?: (event: unknown) => void;
  }
  const FakeMap = forwardRef<unknown, FakeMapProps>(function FakeMap({ children, onError }, ref) {
    useImperativeHandle(ref, () => ({
      getSource: () => ({ setData: mapMock.setData }),
      getMap: () => ({ hasImage: () => true, addImage: () => undefined }),
    }));
    return (
      <div data-testid="fake-map">
        <button onClick={() => onError?.({ error: new Error("tiles down") })} type="button">
          break map
        </button>
        {children}
      </div>
    );
  });
  return {
    default: FakeMap,
    Layer: () => null,
    NavigationControl: () => null,
    Source: ({ children }: { readonly children?: ReactNode }) => <>{children}</>,
  };
});

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return {
    ...actual,
    api: vi.fn((path: string) => {
      apiMock.calls.push(path);
      if (!apiMock.responses.has(path)) return Promise.reject(new actual.ApiError({ code: "NOT_FOUND", status: 404 }));
      return Promise.resolve(apiMock.responses.get(path));
    }),
  };
});

const OP_ID = "7d4c7b6e-1b1a-4c55-9a39-0f4a3f0f2a11";
const NOW = new Date();

function operator(overrides: Partial<LiveOperatorDTO> = {}): LiveOperatorDTO {
  return {
    userId: OP_ID,
    name: "Ana Souza",
    lat: -15.6,
    lng: -47.7,
    accuracyM: 8,
    heading: null,
    speedMps: null,
    recordedAt: NOW.toISOString(),
    lastSeenAt: NOW.toISOString(),
    dutyStatus: "ON_DUTY",
    state: "WORKING",
    stale: false,
    deviceId: "dev-1",
    activeWorkOrderId: null,
    ...overrides,
  };
}

function live(operators: readonly LiveOperatorDTO[]): OpsLiveDTO {
  return { generatedAt: NOW.toISOString(), operators, workOrders: [], reports: [], rentals: [], assets: [] };
}

function alert(i: number): OpsAlertDTO {
  return {
    id: `alert-${i}`,
    type: "SLA_AT_RISK",
    severity: "warning",
    entityType: "WORK_ORDER",
    entityId: `wo-${i}`,
    label: `WO-${String(i).padStart(4, "0")}`,
    at: new Date(NOW.getTime() - i * 60_000).toISOString(),
    params: {},
  };
}

function setResponses(liveData: OpsLiveDTO, alerts: readonly OpsAlertDTO[] = []) {
  apiMock.responses.set("/ops/live", liveData);
  apiMock.responses.set("/ops/kpis", {
    range: "today",
    generatedAt: NOW.toISOString(),
    counts: { open_reports: 1, unassigned_wos: 2, in_progress: 3, done_today: 4, sla_at_risk: 5, active_rentals: 6, overdue_rentals: 0, on_duty: 1 },
    slaBreached: 0,
    slaCompliancePct: 95,
    mttrHours: 3.5,
    utilizationPct: 60,
  });
  apiMock.responses.set("/ops/alerts", { generatedAt: NOW.toISOString(), items: alerts });
  apiMock.responses.set("/ops/activity", { items: [], nextCursor: null });
  apiMock.responses.set("/auth/me", { user: { id: "me", name: "Admin", role: "MANAGER" }, settings: null });
  apiMock.responses.set(`/ops/operators/${OP_ID}/trail`, { userId: OP_ID, from: NOW.toISOString(), to: NOW.toISOString(), points: [] });
}

function fakeSocket() {
  const setState = (state: typeof realtimeMock.status.state) => {
    realtimeMock.status = { ...realtimeMock.status, state };
    for (const listener of realtimeMock.listeners) listener();
  };
  return {
    ready: () => waitFor(() => expect(realtimeMock.handlers.size).toBeGreaterThan(0)),
    emit: (event: string, payload?: unknown) => {
      act(() => {
        if (event === "connect") setState("connected");
        else if (event === "disconnect") setState("reconnecting");
        else for (const handler of realtimeMock.handlers.get(event) ?? []) handler(payload);
      });
    },
  };
}

describe("OpsCenter", () => {
  let clock = 0;

  beforeEach(() => {
    navigation.replace.mockClear();
    navigation.search = "";
    mapMock.setData.mockClear();
    apiMock.responses.clear();
    apiMock.calls.length = 0;
    intlErrors.length = 0;
    clock = 0;
    realtimeMock.handlers.clear();
    realtimeMock.status = { state: "connecting", lastMessageAt: null, reconnectCount: 0 };
    vi.stubGlobal("requestAnimationFrame", (cb: (time: number) => void) => setTimeout(() => cb(clock), 0) as unknown as number);
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => clearTimeout(handle));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    expect(intlErrors).toEqual([]);
  });

  it("moves an operator marker on operator:location with one setData on the operators source", async () => {
    setResponses(live([operator()]));
    const socket = fakeSocket();
    const store = new OperatorStore(() => clock);
    renderWithProviders(<OpsCenter store={store} />);
    await socket.ready();
    await waitFor(() => expect(store.size).toBe(1));
    socket.emit("connect");

    socket.emit("operator:location", { userId: OP_ID, lat: -15.7, lng: -47.9, recordedAt: new Date(NOW.getTime() + 10_000).toISOString(), state: "EN_ROUTE" });
    clock += 2_000;

    await waitFor(() => {
      const frames = mapMock.setData.mock.calls.map((c) => c[0] as { features: { geometry: { coordinates: [number, number] }; properties: { state: string } }[] });
      const last = frames.at(-1);
      expect(last?.features[0]?.geometry.coordinates).toEqual([-47.9, -15.7]);
      expect(last?.features[0]?.properties.state).toBe("EN_ROUTE");
    });
  });

  it("writes the KPI filter to the URL when a tile is pressed", async () => {
    setResponses(live([operator()]));
    renderWithProviders(<OpsCenter />);
    const tile = await screen.findByRole("button", { name: /SLA at risk/u });
    await userEvent.click(tile);
    expect(navigation.replace).toHaveBeenCalledWith("/ops?kpi=sla_at_risk", { scroll: false });
  });

  it("groups 100 alerts behind one keyboard-reachable header without hiding any", async () => {
    setResponses(live([operator()]), Array.from({ length: 100 }, (_, i) => alert(i)));
    renderWithProviders(<OpsCenter />);
    expect(await screen.findByText("Similar alerts were grouped")).toBeTruthy();
    const toggle = await screen.findByRole("button", { name: /Show all 100/u });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    toggle.focus();
    await userEvent.keyboard("{Enter}");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const list = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
    expect(list).not.toBeNull();
    expect(within(list as HTMLElement).getAllByRole("link")).toHaveLength(100);
  });

  it("shows the paused banner with the last update time and clears it on reconnect", async () => {
    setResponses(live([operator()]));
    const socket = fakeSocket();
    renderWithProviders(<OpsCenter />);
    await socket.ready();
    socket.emit("connect");
    expect(screen.queryByTestId("realtime-paused")).toBeNull();

    socket.emit("disconnect");
    const banner = await screen.findByTestId("realtime-paused");
    expect(banner.textContent).toContain("Live updates paused");
    expect(banner.textContent).toMatch(/Last update: .+/u);

    const liveCalls = apiMock.calls.filter((p) => p === "/ops/live").length;
    socket.emit("connect");
    await waitFor(() => expect(screen.queryByTestId("realtime-paused")).toBeNull());
    await waitFor(() => expect(apiMock.calls.filter((p) => p === "/ops/live").length).toBeGreaterThan(liveCalls));
  });

  it("keeps lists usable when the map fails and remounts it on Try again", async () => {
    setResponses(live([operator()]), [alert(1)]);
    renderWithProviders(<OpsCenter />);
    await userEvent.click(await screen.findByRole("button", { name: "break map" }));
    const error = await screen.findByTestId("map-error");
    expect(error.textContent).toContain("Map unavailable right now");
    expect(screen.queryByTestId("fake-map")).toBeNull();
    expect(await screen.findByText("WO-0001")).toBeTruthy();
    await userEvent.click(within(error).getByRole("button", { name: /Try again/u }));
    expect(await screen.findByTestId("fake-map")).toBeTruthy();
  });

  it("explains an empty map when no one is live", async () => {
    setResponses(live([]));
    renderWithProviders(<OpsCenter />);
    expect(await screen.findByText("No one is live right now")).toBeTruthy();
  });

  it("shows the stale banner with last update and the device health link for a stale operator", async () => {
    const old = new Date(NOW.getTime() - 20 * 60_000).toISOString();
    setResponses(live([operator({ stale: true, recordedAt: old, lastSeenAt: old })]));
    navigation.search = `operator=${OP_ID}`;
    renderWithProviders(<OpsCenter />);
    expect(await screen.findByText("Location is out of date")).toBeTruthy();
    const link = screen.getByRole("link", { name: /See phone sync health/u });
    expect(link.getAttribute("href")).toBe("/team/devices?device=dev-1");
    expect(screen.getByText("No one is live right now")).toBeTruthy();
  });
});
