// @vitest-environment jsdom
import type { PlotDTO } from "@agrorende/contracts/dto";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ApiModule from "@/lib/api";

import { intlErrors, renderWithProviders } from "@/features/ops/testing";

import { PlotBoundaryDialog } from "./PlotBoundaryDialog";

const calls = vi.hoisted(() => ({
  patches: [] as { path: string; body: unknown; version: unknown }[],
  fail: null as string | null,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("./BoundaryDrawMap", () => ({
  BoundaryDrawMap: ({
    ring,
    onChange,
  }: {
    ring: [number, number][] | null;
    onChange: (ring: [number, number][] | null) => void;
  }) => (
    <div data-testid="draw-map" data-ring={JSON.stringify(ring)}>
      <button
        onClick={() =>
          onChange([
            [-55.721534, -12.545812],
            [-55.700921, -12.546303],
            [-55.698774, -12.561127],
            [-55.721534, -12.545812],
          ])
        }
        type="button"
      >
        simulate-draw
      </button>
    </div>
  ),
}));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return {
    ...actual,
    api: vi.fn(
      (path: string, request: { body?: Record<string, unknown>; version?: string } = {}) => {
        calls.patches.push({ path, body: request.body, version: request.version });
        if (calls.fail !== null)
          return Promise.reject(
            new actual.ApiError({
              code: calls.fail as ApiModule.ApiError["code"],
              status: 422,
              retryable: false,
            }),
          );
        return Promise.resolve({ ...PLOT, areaHa: 120.5, syncVersion: "2" });
      },
    ),
  };
});

const PLOT: PlotDTO = {
  id: "p1",
  siteId: "s1",
  name: "Talhão 7",
  code: null,
  crop: null,
  areaHa: 50,
  boundary: null,
  centroidLat: null,
  centroidLng: null,
  archivedAt: null,
  syncVersion: "1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as unknown as PlotDTO;

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

beforeEach(() => {
  calls.patches.length = 0;
  calls.fail = null;
  intlErrors.length = 0;
});

afterEach(cleanup);

describe("PlotBoundaryDialog", () => {
  it("saves a drawn polygon and lets the server recompute area and centroid", async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <PlotBoundaryDialog
        onClose={onClose}
        onConflictReload={() => Promise.resolve(undefined)}
        plot={PLOT}
      />,
    );
    expect(screen.getByTestId("boundary-area").textContent).toMatch(/No boundary yet/);
    await userEvent.click(screen.getByRole("button", { name: "simulate-draw" }));
    expect(screen.getByTestId("boundary-area").textContent).toMatch(
      /Area from the boundary: [\d,.]+ ha/,
    );
    expect(
      (screen.getByLabelText("Corners (longitude, latitude)") as HTMLTextAreaElement).value.split(
        "\n",
      ),
    ).toHaveLength(3);
    await userEvent.click(screen.getByRole("button", { name: "Save boundary" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls.patches[0]).toEqual({
      path: "/plots/p1",
      version: "1",
      body: {
        boundary: {
          type: "Polygon",
          coordinates: [
            [
              [-55.721534, -12.545812],
              [-55.700921, -12.546303],
              [-55.698774, -12.561127],
              [-55.721534, -12.545812],
            ],
          ],
        },
        areaHa: null,
        centroidLat: null,
        centroidLng: null,
      },
    });
    expect(intlErrors).toEqual([]);
  });

  it("accepts typed corners, flags bad lines, and blocks saving without a boundary", async () => {
    renderWithProviders(
      <PlotBoundaryDialog
        onClose={vi.fn()}
        onConflictReload={() => Promise.resolve(undefined)}
        plot={PLOT}
      />,
      { locale: "pt-BR" },
    );
    await userEvent.click(screen.getByRole("button", { name: "Salvar limite" }));
    expect(await screen.findByText("Um limite precisa de pelo menos três vértices.")).toBeTruthy();
    expect(calls.patches).toHaveLength(0);
    const field = screen.getByLabelText("Vértices (longitude, latitude)");
    fireEvent.change(field, { target: { value: "-47, -22\n-46.99, abc\n-46.99, -21.99" } });
    expect(
      screen.getByText("Cada linha precisa de longitude e latitude separadas por vírgula."),
    ).toBeTruthy();
    fireEvent.change(field, {
      target: { value: "-47, -22\n-46.99, -22\n-46.99, -21.99\n-47, -21.99" },
    });
    expect(screen.getByTestId("boundary-area").textContent).toMatch(
      /Área pelo limite: 11[0-5],\d\d ha/,
    );
    expect(JSON.parse(screen.getByTestId("draw-map").dataset.ring ?? "null")).toHaveLength(5);
    expect(intlErrors).toEqual([]);
  });

  it("removes an existing boundary and shows a server geometry error in the dialog", async () => {
    const withBoundary = {
      ...PLOT,
      boundary: {
        type: "Polygon",
        coordinates: [
          [
            [-47, -22],
            [-46.99, -22],
            [-46.99, -21.99],
            [-47, -22],
          ],
        ],
      },
    } as PlotDTO;
    calls.fail = "PLOT_GEOMETRY_INVALID";
    renderWithProviders(
      <PlotBoundaryDialog
        onClose={vi.fn()}
        onConflictReload={() => Promise.resolve(undefined)}
        plot={withBoundary}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save boundary" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    calls.fail = null;
    await userEvent.click(screen.getByRole("button", { name: "Remove boundary" }));
    await waitFor(() =>
      expect(calls.patches.at(-1)).toEqual({
        path: "/plots/p1",
        body: { boundary: null },
        version: "1",
      }),
    );
  });
});
