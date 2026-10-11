// @vitest-environment jsdom
import type { ColumnDef } from "@tanstack/react-table";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Profiler, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/features/ops/testing";

import { DataTable } from "./DataTable";

interface Row {
  readonly id: string;
  readonly code: string;
}

const rows: Row[] = [
  { id: "a", code: "TR-01" },
  { id: "b", code: "TR-02" },
];
const columns: ColumnDef<Row, unknown>[] = [{ header: "Code", accessorKey: "code" }];

afterEach(cleanup);

function Harness({ onRowClick, onSelection }: { readonly onRowClick: (row: Row) => void; readonly onSelection: (ids: ReadonlySet<string>) => void }) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  return (
    <DataTable
      caption="Machines"
      columns={columns}
      empty={null}
      error={null}
      isLoading={false}
      onRetry={() => undefined}
      onRowClick={onRowClick}
      rowKey={(row) => row.id}
      rows={rows}
      selection={{
        selectedIds: selected,
        onChange: (ids) => {
          setSelected(ids);
          onSelection(ids);
        },
        label: (row) => `Select ${row.code}`,
        pageLabel: "Select page",
      }}
    />
  );
}

describe("DataTable selection (T16-004)", () => {
  it("selects rows without triggering the row click and selects the whole page from the header", async () => {
    const onRowClick = vi.fn();
    const onSelection = vi.fn();
    renderWithProviders(<Harness onRowClick={onRowClick} onSelection={onSelection} />);

    await userEvent.click(screen.getByRole("checkbox", { name: "Select TR-01" }));
    expect(onRowClick).not.toHaveBeenCalled();
    expect([...(onSelection.mock.lastCall?.[0] as ReadonlySet<string>)]).toEqual(["a"]);
    expect((screen.getByRole("checkbox", { name: "Select page" }) as HTMLInputElement).checked).toBe(false);

    await userEvent.click(screen.getByRole("checkbox", { name: "Select page" }));
    expect([...(onSelection.mock.lastCall?.[0] as ReadonlySet<string>)].sort()).toEqual(["a", "b"]);
    expect((screen.getByRole("checkbox", { name: "Select TR-02" }) as HTMLInputElement).checked).toBe(true);

    await userEvent.click(screen.getByRole("checkbox", { name: "Select page" }));
    expect([...(onSelection.mock.lastCall?.[0] as ReadonlySet<string>)]).toEqual([]);

    await userEvent.click(screen.getByText("TR-02"));
    expect(onRowClick).toHaveBeenCalledWith(rows[1]);
  });

  it("renders no checkbox column without the selection prop", () => {
    renderWithProviders(
      <DataTable caption="Machines" columns={columns} empty={null} error={null} isLoading={false} onRetry={() => undefined} rowKey={(row) => row.id} rows={rows} />,
    );
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});

describe("DataTable loading and refreshing (FILTERS-ALIGN)", () => {
  function table(props: { readonly isLoading?: boolean; readonly isRefreshing?: boolean; readonly rows?: readonly Row[] | undefined }) {
    return (
      <DataTable
        caption="Machines"
        columns={columns}
        empty={null}
        error={null}
        isLoading={props.isLoading ?? false}
        isRefreshing={props.isRefreshing ?? false}
        onRetry={() => undefined}
        rowKey={(row) => row.id}
        rows={"rows" in props ? props.rows : rows}
        toolbar={<input aria-label="Toolbar search" />}
      />
    );
  }

  it("keeps the previous rows dimmed and busy while new filters load, then clears both", () => {
    const { rerender } = renderWithProviders(table({ isRefreshing: true }));
    expect(screen.getByText("TR-01")).toBeTruthy();
    const frame = screen.getByTestId("refreshing-frame");
    expect(frame.getAttribute("aria-busy")).toBe("true");
    expect(frame.className).toContain("opacity-60");
    expect(frame.contains(screen.getByRole("table"))).toBe(true);
    rerender(table({ isRefreshing: false }));
    expect(screen.getByTestId("refreshing-frame").hasAttribute("aria-busy")).toBe(false);
    expect(screen.getByTestId("refreshing-frame").className).not.toContain("opacity-60");
  });

  it("does not loop re-rendering when the parent updates while rows are still loading", async () => {
    let renders = 0;
    function Parent() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen((o) => !o)} type="button">
            {open ? "Close form" : "Open form"}
          </button>
          <Profiler id="table" onRender={() => (renders += 1)}>
            <DataTable caption="Machines" columns={columns} empty={null} error={null} isLoading onRetry={() => undefined} rowKey={(row) => row.id} rows={undefined} />
          </Profiler>
        </>
      );
    }
    renderWithProviders(<Parent />);
    await userEvent.click(screen.getByRole("button", { name: "Open form" }));
    await userEvent.click(screen.getByRole("button", { name: "Close form" }));
    expect(screen.getByTestId("table-loading")).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(renders).toBeLessThan(10);
  });

  it("shows the table skeleton on first load with the toolbar already mounted", () => {
    const { rerender } = renderWithProviders(table({ isLoading: true, rows: undefined }));
    const toolbar = screen.getByRole("textbox", { name: "Toolbar search" });
    expect(screen.getByTestId("table-loading")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    rerender(table({ isLoading: false }));
    expect(screen.queryByTestId("table-loading")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Toolbar search" })).toBe(toolbar);
    expect(screen.getByTestId("refreshing-frame").hasAttribute("aria-busy")).toBe(false);
  });
});
