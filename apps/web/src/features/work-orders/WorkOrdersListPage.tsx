"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Columns3, ImageOff, Plus, Rows3, Tractor, UserRound, Wrench } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState, type DragEvent } from "react";
import { toast } from "sonner";

import { PriorityBadge, StatusBadge } from "@/components/data/badges";
import { DataTable } from "@/components/data/DataTable";
import { EmptyState, LoadingState } from "@/components/data/States";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { ListPage } from "@/lib/forms";
import { useUrlState } from "@/lib/url-state";

import { AssignDialog } from "./AssignDialog";
import { LateEvidenceBadge, SlaBadge } from "./badges";
import { BOARD_COLUMNS, DUE_FILTERS, PRIORITIES, WORK_ORDER_STATUSES, type WorkOrderListItem } from "./types";

const KEYS = ["view", "status", "priority", "assigneeId", "due", "q", "cursor"] as const;
const DEFAULTS = { view: "board", status: "active" } as const;

/** Office work-order list (WO-02): a board grouped by who acts next, or a filterable table. Filters live in the URL. */
export function WorkOrdersListPage() {
  const t = useTranslations("jobs");
  const common = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [filters, setFilters] = useUrlState(KEYS, DEFAULTS);
  const board = filters.view !== "table";
  const query = useQuery({
    queryKey: ["work-orders", filters],
    queryFn: () =>
      api<ListPage<WorkOrderListItem>>("/work-orders", {
        query: {
          status: filters.status.length > 0 && filters.status !== "all" ? filters.status : undefined,
          priority: filters.priority.length > 0 ? filters.priority : undefined,
          assigneeId: filters.assigneeId.length > 0 ? filters.assigneeId : undefined,
          due: filters.due.length > 0 ? filters.due : undefined,
          q: filters.q.length > 0 ? filters.q : undefined,
          cursor: board || filters.cursor.length === 0 ? undefined : filters.cursor,
          limit: board ? 200 : 50,
        },
      }),
  });
  const users = useQuery({ queryKey: ["users", { picker: "FIELD" }], queryFn: () => api<ListPage<{ id: string; name: string }>>("/users", { query: { role: "FIELD", limit: 100 } }) });
  const columns = useMemo<ColumnDef<WorkOrderListItem, unknown>[]>(
    () => [
      { header: t("fields.number"), accessorKey: "number", cell: (c) => <span className="font-mono font-semibold">{c.row.original.number}</span> },
      {
        header: t("fields.title"),
        accessorKey: "title",
        cell: (c) => {
          const wo = c.row.original;
          return (
            <span className="flex flex-col">
              <span className="font-semibold">{wo.title}</span>
              <span className="text-sm text-[var(--ar-text-muted)]">{wo.assetCode === null || wo.assetCode === undefined ? t("noAsset") : `${wo.assetCode} · ${wo.assetName ?? ""}`}</span>
            </span>
          );
        },
      },
      { header: t("fields.priority"), accessorKey: "priority", cell: (c) => <PriorityBadge priority={c.row.original.priority} /> },
      {
        header: t("fields.status"),
        accessorKey: "status",
        cell: (c) => (
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge kind="workOrder" status={c.row.original.status} />
            {c.row.original.hasLateEvidence ? <LateEvidenceBadge /> : null}
          </span>
        ),
      },
      { header: t("fields.assignee"), accessorKey: "assigneeName", cell: (c) => c.row.original.assigneeName ?? t("unassigned") },
      { header: t("fields.site"), accessorKey: "siteName", cell: (c) => c.row.original.siteName ?? "—" },
      {
        header: t("fields.dueAt"),
        accessorKey: "dueAt",
        cell: (c) => (
          <span className="flex flex-wrap items-center gap-2">
            {formatDateTime(c.row.original.dueAt, locale)}
            <SlaBadge sla={c.row.original.sla} />
          </span>
        ),
      },
    ],
    [t, locale],
  );
  const filtered = filters.q.length > 0 || filters.priority.length > 0 || filters.assigneeId.length > 0 || filters.due.length > 0 || filters.status !== "active";
  const empty = <EmptyState action={filtered ? undefined : <Link className={buttonVariants({ variant: "primary" })} href="/work-orders/new"><Plus aria-hidden="true" className="size-4" />{t("actions.new")}</Link>} body={filtered ? common("states.noMatchesBody") : t("list.emptyBody")} animation={filtered ? undefined : "first-work-order"} icon={<Wrench className="size-8" />} title={filtered ? common("states.noMatches") : t("list.emptyTitle")} />;
  const toolbar = (
    <>
      <Input aria-label={common("filters.search")} className="max-w-xs" defaultValue={filters.q} onChange={(e) => setFilters({ q: e.target.value, cursor: null })} placeholder={t("list.searchPlaceholder")} type="search" />
      <Select aria-label={t("fields.status")} className="max-w-56" onChange={(e) => setFilters({ status: e.target.value, cursor: null })} value={filters.status}>
        <option value="active">{t("list.activeStatuses")}</option>
        <option value="all">{t("list.allStatuses")}</option>
        {WORK_ORDER_STATUSES.map((s) => (
          <option key={s} value={s}>
            {common(`status.workOrder.${s}`)}
          </option>
        ))}
      </Select>
      <Select aria-label={t("fields.priority")} className="max-w-48" onChange={(e) => setFilters({ priority: e.target.value, cursor: null })} value={filters.priority}>
        <option value="">{t("list.allPriorities")}</option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {common(`priority.${p}`)}
          </option>
        ))}
      </Select>
      <Select aria-label={t("fields.assignee")} className="max-w-56" onChange={(e) => setFilters({ assigneeId: e.target.value, cursor: null })} value={filters.assigneeId}>
        <option value="">{t("list.allAssignees")}</option>
        <option value="none">{t("unassigned")}</option>
        {(users.data?.items ?? []).map((user) => (
          <option key={user.id} value={user.id}>
            {user.name}
          </option>
        ))}
      </Select>
      <Select aria-label={t("fields.dueAt")} className="max-w-48" onChange={(e) => setFilters({ due: e.target.value, cursor: null })} value={filters.due}>
        <option value="">{t("list.anyDue")}</option>
        {DUE_FILTERS.map((d) => (
          <option key={d} value={d}>
            {t(`due.${d}`)}
          </option>
        ))}
      </Select>
    </>
  );
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        actions={
          <>
            <div aria-label={t("list.view")} className="flex gap-1" role="group">
              <Button aria-pressed={board} icon={<Columns3 aria-hidden="true" className="size-4" />} onClick={() => setFilters({ view: "board", cursor: null })} variant={board ? "primary" : "secondary"}>
                {t("list.board")}
              </Button>
              <Button aria-pressed={!board} icon={<Rows3 aria-hidden="true" className="size-4" />} onClick={() => setFilters({ view: "table" })} variant={board ? "secondary" : "primary"}>
                {t("list.table")}
              </Button>
            </div>
            <Link className={buttonVariants({ variant: "primary" })} href="/work-orders/new">
              <Plus aria-hidden="true" className="size-4" />
              {t("actions.new")}
            </Link>
          </>
        }
        title={t("list.title")}
      />
      {board ? (
        <>
          <div className="flex flex-wrap items-center gap-2">{toolbar}</div>
          {query.isLoading ? (
            <LoadingState />
          ) : query.error !== null ? (
            <ErrorAlert error={query.error} onRetry={() => void query.refetch()} />
          ) : (query.data?.items.length ?? 0) === 0 ? (
            empty
          ) : (
            <Board items={query.data?.items ?? []} />
          )}
        </>
      ) : (
        <DataTable
          caption={t("list.title")}
          columns={columns}
          empty={empty}
          error={query.error}
          hasPrevious={filters.cursor.length > 0}
          isLoading={query.isLoading}
          nextCursor={query.data?.nextCursor ?? null}
          onFirst={() => setFilters({ cursor: null })}
          onNext={(cursor) => setFilters({ cursor })}
          onRetry={() => void query.refetch()}
          onRowClick={(row) => router.push(`/work-orders/${row.id}`)}
          rowKey={(row) => row.id}
          rows={query.data?.items}
          toolbar={toolbar}
        />
      )}
    </div>
  );
}

const DRAG_TYPE = "application/x-agrorende-work-order";

/** Dropping an unassigned card on the Assigned column opens the assign dialog (WO-02); nothing changes until it is confirmed. */
function Board({ items }: { readonly items: readonly WorkOrderListItem[] }) {
  const t = useTranslations("jobs");
  const client = useQueryClient();
  const [dragging, setDragging] = useState<WorkOrderListItem | null>(null);
  const [assigning, setAssigning] = useState<WorkOrderListItem | null>(null);
  const columns = BOARD_COLUMNS.map((column) => ({ ...column, items: items.filter((item) => column.statuses.includes(item.status)) }));
  const done = items.filter((item) => item.status === "VERIFIED" || item.status === "CANCELLED");
  const accepts = (key: string): boolean => key === "assigned" && dragging?.status === "OPEN";
  const onDrop = (event: DragEvent<HTMLElement>, key: string) => {
    if (!accepts(key)) return;
    event.preventDefault();
    const id = event.dataTransfer.getData(DRAG_TYPE);
    const item = items.find((candidate) => candidate.id === id) ?? dragging;
    setDragging(null);
    if (item !== null) setAssigning(item);
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {columns.map((column) => (
          <section
            aria-labelledby={`col-${column.key}`}
            className={`flex min-w-0 flex-col gap-2 rounded-cards bg-[var(--ar-surface-muted)] p-2 ${accepts(column.key) ? "outline-2 outline-dashed outline-[var(--ar-focus)]" : ""}`}
            data-column={column.key}
            key={column.key}
            onDragOver={(event) => {
              if (accepts(column.key)) event.preventDefault();
            }}
            onDrop={(event) => onDrop(event, column.key)}
          >
            <h2 className="flex items-center justify-between px-1 font-semibold" id={`col-${column.key}`}>
              {t(`board.${column.key}`)}
              <span className="rounded-full bg-[var(--ar-surface)] px-2 text-sm">{column.items.length}</span>
            </h2>
            {column.items.length === 0 ? (
              <p className="px-1 text-sm text-[var(--ar-text-muted)]">{t("board.empty")}</p>
            ) : (
              column.items.map((item) => <BoardCard item={item} key={item.id} onDragEnd={() => setDragging(null)} onDragStart={() => setDragging(item)} />)
            )}
          </section>
        ))}
      </div>
      {done.length === 0 ? null : <p className="text-sm text-[var(--ar-text-muted)]">{t("board.closedHidden", { count: done.length })}</p>}
      {assigning === null ? null : (
        <AssignDialog
          mode="assign"
          onClose={() => setAssigning(null)}
          onDone={() => {
            setAssigning(null);
            toast.success(t("toast.assign"));
            void client.invalidateQueries({ queryKey: ["work-orders"] });
          }}
          open
          workOrder={assigning}
        />
      )}
    </div>
  );
}

function BoardCard({ item, onDragStart, onDragEnd }: { readonly item: WorkOrderListItem; readonly onDragStart: () => void; readonly onDragEnd: () => void }) {
  const t = useTranslations("jobs");
  const locale = useLocale();
  return (
    <Link className="flex min-h-12 flex-col gap-2 rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-3 hover:border-[var(--ar-border-strong)] focus-visible:outline-3 focus-visible:outline-[var(--ar-focus)]"
      data-work-order={item.number}
      draggable={item.status === "OPEN"}
      href={`/work-orders/${item.id}`}
      onDragEnd={onDragEnd}
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, item.id);
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold">{item.number}</span>
        <PriorityBadge priority={item.priority} />
      </span>
      <span className="font-semibold leading-snug">{item.title}</span>
      <span className="flex items-center gap-1 text-sm text-[var(--ar-text-muted)]">
        <Tractor aria-hidden="true" className="size-4 shrink-0" />
        {item.assetCode === null || item.assetCode === undefined ? t("noAsset") : `${item.assetCode} · ${item.assetName ?? ""}`}
      </span>
      <span className="flex items-center gap-1 text-sm">
        <UserRound aria-hidden="true" className="size-4 shrink-0" />
        {item.assigneeName ?? t("unassigned")}
      </span>
      <span className="flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge kind="workOrder" status={item.status} />
        <SlaBadge sla={item.sla} />
        {item.hasLateEvidence ? <ImageOff aria-label={t("flags.lateEvidence")} className="size-4" role="img" /> : null}
      </span>
      {item.dueAt === null || item.dueAt === undefined ? null : <span className="text-sm text-[var(--ar-text-muted)]">{t("dueOn", { when: formatDateTime(item.dueAt, locale) })}</span>}
    </Link>
  );
}
