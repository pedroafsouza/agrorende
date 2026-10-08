// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ApiModule from "@/lib/api";

import type { CostRollupDTO } from "@agrorende/core/modules/costs/dto";

import { intlErrors, renderWithProviders } from "@/features/ops/testing";

import { CostsPage } from "./CostsPage";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), search: "" }));
const apiMock = vi.hoisted(() => ({ rollup: undefined as unknown, queries: [] as unknown[] }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/costs",
  useSearchParams: () => new URLSearchParams(navigation.search),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return {
    ...actual,
    api: vi.fn((path: string, request: { query?: unknown } = {}) => {
      if (path === "/costs/rollup") {
        apiMock.queries.push(request.query);
        return Promise.resolve(apiMock.rollup);
      }
      return Promise.resolve({ items: [], nextCursor: null });
    }),
  };
});

const zero = { laborCents: 0, partsCents: 0, externalCents: 0, fuelCents: 0, rentInCostCents: 0, totalCostCents: 0, rentalRevenueCents: 0 };

function rollup(overrides: Partial<CostRollupDTO> = {}): CostRollupDTO {
  return {
    groupBy: "season",
    from: null,
    to: null,
    laborVisible: true,
    rows: [
      { key: "s1", label: "Safra 24/25", ...zero, laborCents: 10_000, partsCents: 25_050, totalCostCents: 35_050, rentalRevenueCents: 90_000 },
      { key: "none", label: "No season", ...zero, partsCents: 5_000, totalCostCents: 5_000 },
    ],
    totals: { ...zero, laborCents: 10_000, partsCents: 30_050, totalCostCents: 40_050, rentalRevenueCents: 90_000 },
    workOrderCount: 3,
    rentalCount: 1,
    ...overrides,
  };
}

describe("CostsPage", () => {
  beforeEach(() => {
    navigation.replace.mockClear();
    navigation.search = "groupBy=season";
    apiMock.queries.length = 0;
    intlErrors.length = 0;
  });

  afterEach(() => {
    cleanup();
    expect(intlErrors).toEqual([]);
  });

  it("renders every cost column, the no-season row and totals in money", async () => {
    apiMock.rollup = rollup();
    renderWithProviders(<CostsPage />);
    const table = await screen.findByRole("table");
    const headers = within(table).getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Season", "Labour", "Parts", "External servicesComing soon", "FuelComing soon", "Rented-in machines", "Total cost", "Rental revenue"]);
    const none = table.querySelector('[data-row="none"]');
    expect(none?.textContent).toContain("No season");
    expect(table.querySelector("tfoot")?.textContent).toContain("400.50");
    expect(screen.getByText("Some costs have no season")).toBeTruthy();
    expect(apiMock.queries[0]).toMatchObject({ groupBy: "season", locale: "en" });
  });

  it("hides the labour column when the organisation hides it from managers", async () => {
    apiMock.rollup = rollup({ laborVisible: false });
    renderWithProviders(<CostsPage />);
    const table = await screen.findByRole("table");
    expect(within(table).queryByRole("columnheader", { name: "Labour" })).toBeNull();
    expect(screen.getByText(/Labour cost is hidden/u)).toBeTruthy();
  });

  it("writes the group-by choice to the URL", async () => {
    apiMock.rollup = rollup();
    renderWithProviders(<CostsPage />);
    await screen.findByRole("table");
    await userEvent.selectOptions(screen.getByLabelText("Group by"), "site");
    expect(navigation.replace).toHaveBeenCalledWith("/costs?groupBy=site", { scroll: false });
  });
});
