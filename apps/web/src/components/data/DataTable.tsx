"use client";

import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/Button";

import { QueryState } from "./States";

export interface DataTableProps<T> {
  readonly columns: ColumnDef<T, unknown>[];
  readonly rows: readonly T[] | undefined;
  readonly rowKey: (row: T) => string;
  readonly isLoading: boolean;
  readonly error: unknown;
  readonly onRetry: () => void;
  readonly empty: ReactNode;
  readonly onRowClick?: (row: T) => void;
  readonly nextCursor?: string | null;
  readonly onNext?: (cursor: string) => void;
  readonly onFirst?: () => void;
  readonly hasPrevious?: boolean;
  readonly caption: string;
  readonly toolbar?: ReactNode;
  /** Row selection for bulk actions: a leading 48 dp checkbox column kept out of the row click. */
  readonly selection?: DataTableSelection<T>;
}

export interface DataTableSelection<T> {
  readonly selectedIds: ReadonlySet<string>;
  readonly onChange: (ids: ReadonlySet<string>) => void;
  /** Accessible name of the row checkbox, for example "Select TR-01". */
  readonly label: (row: T) => string;
  /** Accessible name of the header checkbox that selects every row on the page. */
  readonly pageLabel: string;
}

function toggled(current: ReadonlySet<string>, ids: readonly string[], on: boolean): ReadonlySet<string> {
  const next = new Set(current);
  for (const id of ids) {
    if (on) next.add(id);
    else next.delete(id);
  }
  return next;
}

/** TanStack table with cursor paging; filters live in the URL via `useUrlState` (A§14.2). */
export function DataTable<T>({ columns, rows, rowKey, isLoading, error, onRetry, empty, onRowClick, nextCursor, onNext, onFirst, hasPrevious = false, caption, toolbar, selection }: DataTableProps<T>) {
  const t = useTranslations("common");
  const table = useReactTable({ data: rows as T[] ?? [], columns, getCoreRowModel: getCoreRowModel(), getRowId: rowKey });
  const pageIds = (rows ?? []).map(rowKey);
  const allOnPage = selection !== undefined && pageIds.length > 0 && pageIds.every((id) => selection.selectedIds.has(id));
  return (
    <div className="flex flex-col gap-3">
      {toolbar === undefined ? null : <div className="flex flex-wrap items-end gap-3">{toolbar}</div>}
      <QueryState empty={empty} error={error} isEmpty={(rows?.length ?? 0) === 0} isLoading={isLoading} onRetry={onRetry}>
        <div className="overflow-x-auto rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)]">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead className="bg-[var(--ar-surface-muted)]">
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {selection === undefined ? null : (
                    <th className="w-12" scope="col">
                      <span className="flex size-12 items-center justify-center">
                        <input
                          aria-label={selection.pageLabel}
                          checked={allOnPage}
                          className="size-5 accent-[var(--ar-primary)]"
                          onChange={(e) => selection.onChange(toggled(selection.selectedIds, pageIds, e.target.checked))}
                          type="checkbox"
                        />
                      </span>
                    </th>
                  )}
                  {group.headers.map((header) => (
                    <th className="px-4 py-3 font-semibold" key={header.id} scope="col">
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                  {onRowClick === undefined ? null : <th className="w-12" scope="col"><span className="sr-only">{t("table.open")}</span></th>}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  className={onRowClick === undefined ? "border-t border-[var(--ar-border)]" : "cursor-pointer border-t border-[var(--ar-border)] hover:bg-[var(--ar-surface-muted)]"}
                  key={row.id}
                  onClick={onRowClick === undefined ? undefined : () => onRowClick(row.original)}
                >
                  {selection === undefined ? null : (
                    <td className="w-12 px-0" onClick={(e) => e.stopPropagation()}>
                      <label className="flex size-12 cursor-pointer items-center justify-center">
                        <input
                          aria-label={selection.label(row.original)}
                          checked={selection.selectedIds.has(row.id)}
                          className="size-5 accent-[var(--ar-primary)]"
                          onChange={(e) => selection.onChange(toggled(selection.selectedIds, [row.id], e.target.checked))}
                          type="checkbox"
                        />
                      </label>
                    </td>
                  )}
                  {row.getVisibleCells().map((cell) => (
                    <td className="h-12 px-4 py-2 align-middle" key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                  {onRowClick === undefined ? null : (
                    <td className="px-2">
                      <button aria-label={t("table.open")} className="flex size-12 items-center justify-center" onClick={() => onRowClick(row.original)} type="button">
                        <ChevronRight aria-hidden="true" className="size-5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(nextCursor ?? null) === null && !hasPrevious ? null : (
          <nav aria-label={t("table.pagination")} className="flex justify-end gap-2">
            {hasPrevious && onFirst !== undefined ? <Button onClick={onFirst}>{t("table.first")}</Button> : null}
            {nextCursor !== null && nextCursor !== undefined && onNext !== undefined ? <Button onClick={() => onNext(nextCursor)}>{t("table.next")}</Button> : null}
          </nav>
        )}
      </QueryState>
    </div>
  );
}
