// @vitest-environment jsdom
import type { ColumnDef } from "@tanstack/react-table";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
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
