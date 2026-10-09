// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ApiModule from "@/lib/api";

import type { AnalyticsDTO, AnalyticsMetric } from "@agrorende/core/modules/ops/analytics";

import { intlErrors, renderWithProviders } from "@/features/ops/testing";

import { AnalyticsPage } from "./AnalyticsPage";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), search: "" }));
const apiMock = vi.hoisted(() => ({
  responses: {} as Record<string, unknown>,
  queries: [] as Record<string, unknown>[],
  fail: false,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: navigation.replace,
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/analytics",
  useSearchParams: () => new URLSearchParams(navigation.search),
}));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return {
    ...actual,
    api: vi.fn((path: string, request: { query?: Record<string, unknown> } = {}) => {
      if (path === "/ops/analytics") {
        const query = request.query ?? {};
        apiMock.queries.push(query);
        if (apiMock.fail)
          return Promise.reject(
            new actual.ApiError({
              code: "INTERNAL",
              status: 500,
              retryable: true,
            }),
          );
        const metric = String(query.metric);
        return Promise.resolve(apiMock.responses[metric] ?? empty(metric as AnalyticsMetric));
      }
      if (path === "/seasons")
        return Promise.resolve({
          items: [{ id: "s1", name: "Safra 25/26" }],
          nextCursor: null,
        });
      return Promise.resolve({ items: [], nextCursor: null });
    }),
  };
});

function empty(metric: AnalyticsMetric): AnalyticsDTO {
  return {
    metric,
    unit: "count",
    from: "2026-09-28",
    to: "2026-10-04",
    seasonId: null,
    series: [],
    summary: null,
  };
}

const zero = {
  laborCents: 0,
  partsCents: 0,
  externalCents: 0,
  fuelCents: 0,
  rentInCostCents: 0,
  totalCostCents: 0,
  rentalRevenueCents: 0,
};

describe("AnalyticsPage", () => {
  beforeEach(() => {
    navigation.replace.mockClear();
    navigation.search = "";
    apiMock.queries.length = 0;
    apiMock.fail = false;
    apiMock.responses = {
      mttr: {
        metric: "mttr",
        unit: "hours",
        from: "2026-09-28",
        to: "2026-10-04",
        seasonId: null,
        series: [{ key: "2026-09-28", label: "2026-09-28", value: 7, secondary: 4 }],
        summary: 7,
      },
      reports_by_category: {
        metric: "reports_by_category",
        unit: "count",
        from: "2026-09-28",
        to: "2026-10-04",
        seasonId: null,
        series: [
          { key: "ENGINE", label: "ENGINE", value: 3 },
          { key: "HYDRAULIC", label: "HYDRAULIC", value: 1 },
        ],
        summary: 4,
      },
    };
    intlErrors.length = 0;
  });

  afterEach(() => {
    cleanup();
    expect(intlErrors).toEqual([]);
  });

  it("renders every operations metric with its summary and the numbers behind the chart", async () => {
    renderWithProviders(<AnalyticsPage />);
    expect(await screen.findByRole("heading", { name: "Mean time to repair" })).toBeTruthy();
    expect((await screen.findByTestId("summary-mttr")).textContent).toBe("7 h");
    expect((await screen.findByTestId("summary-reports_by_category")).textContent).toBe("4");
    const reports = screen.getByRole("table", {
      name: "Field reports by category: data behind the chart",
    });
    expect(reports.querySelector('[data-row="ENGINE"]')?.textContent).toContain("Engine");
    expect(reports.querySelector('[data-row="ENGINE"]')?.textContent).toContain("3");
    expect(screen.getAllByText("Nothing in this period").length).toBe(6);
    const metrics = apiMock.queries.map((q) => q.metric).sort();
    expect(metrics).toEqual([
      "downtime",
      "first_time_fix",
      "mttr",
      "rental_revenue",
      "rental_utilization",
      "reports_by_category",
      "top_failing",
      "wos_by_field_user",
    ]);
    expect(screen.getByText(/last 30 days/)).toBeTruthy();
  });

  it("passes the date and season filters to every metric query", async () => {
    navigation.search = "from=2026-09-01&to=2026-09-30&seasonId=s1";
    renderWithProviders(<AnalyticsPage />);
    await screen.findByTestId("summary-mttr");
    expect(apiMock.queries[0]).toMatchObject({
      from: "2026-09-01",
      to: "2026-09-30",
      seasonId: "s1",
      locale: "en",
    });
    expect(await screen.findByRole("option", { name: "Safra 25/26" })).toBeTruthy();
  });

  it("shows a retryable error instead of a dead end", async () => {
    apiMock.fail = true;
    renderWithProviders(<AnalyticsPage />);
    const retry = await screen.findAllByRole("button", { name: /try again/i });
    expect(retry.length).toBeGreaterThan(0);
  });

  it("switches to the cost tab and charts costs by machine with a link to cost details", async () => {
    navigation.search = "tab=costs";
    apiMock.responses.cost = {
      ...empty("cost"),
      unit: "cents",
      cost: {
        groupBy: "asset",
        from: null,
        to: null,
        laborVisible: false,
        rows: [
          {
            key: "a1",
            label: "Trator 1",
            ...zero,
            partsCents: 25_050,
            totalCostCents: 25_050,
            rentalRevenueCents: 90_000,
          },
        ],
        totals: {
          ...zero,
          partsCents: 25_050,
          totalCostCents: 25_050,
          rentalRevenueCents: 90_000,
        },
        workOrderCount: 1,
        rentalCount: 1,
      },
    };
    renderWithProviders(<AnalyticsPage />);
    const table = await screen.findByRole("table", {
      name: "Costs by Machine",
    });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Machine", "Parts", "Rented-in machines", "Total cost", "Rental revenue"]);
    expect(table.querySelector('[data-row="a1"]')?.textContent).toContain("250.50");
    expect(screen.getByText(/Labour cost is hidden/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open cost details/ }).getAttribute("href")).toBe(
      "/costs?groupBy=asset",
    );
    expect(apiMock.queries.at(-1)).toMatchObject({
      metric: "cost",
      groupBy: "asset",
    });

    await userEvent.click(screen.getByRole("tab", { name: "Operations" }));
    expect(navigation.replace).toHaveBeenCalled();
  });
});
