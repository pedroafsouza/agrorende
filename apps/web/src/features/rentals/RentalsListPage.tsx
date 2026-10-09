"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, List, Plus, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import { StatusBadge } from "@/components/data/badges";
import { DataTable } from "@/components/data/DataTable";
import { EmptyState } from "@/components/data/States";
import { PageHeader } from "@/components/shell/PageHeader";
import { buttonVariants } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { ListPage } from "@/lib/forms";
import { useUrlState } from "@/lib/url-state";

import { OverdueBadge } from "./OverdueBadge";
import { RentalsCalendar, todayIn } from "./RentalsCalendar";
import { RENTAL_TABS, tabStatus, type RentalListItem } from "./types";

const KEYS = ["tab", "q", "cursor", "view", "from", "assetId"] as const;
const DEFAULTS = { tab: "ALL", view: "list" } as const;

/** Office rental list (RN-11): status tabs and search live in the URL so a link reproduces the view. */
export function RentalsListPage() {
  const t = useTranslations("rentals");
  const common = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [filters, setFilters] = useUrlState(KEYS, DEFAULTS);
  const calendar = filters.view === "calendar";
  const query = useQuery({
    enabled: !calendar,
    queryKey: ["rentals", "list", filters],
    queryFn: () =>
      api<ListPage<RentalListItem>>("/rentals", {
        query: {
          status: tabStatus(filters.tab),
          q: filters.q.length > 0 ? filters.q : undefined,
          cursor: filters.cursor.length > 0 ? filters.cursor : undefined,
          limit: 50,
        },
      }),
  });
  const columns = useMemo<ColumnDef<RentalListItem, unknown>[]>(
    () => [
      { header: t("fields.number"), accessorKey: "number", cell: (c) => <span className="font-mono font-semibold">{c.row.original.number}</span> },
      {
        header: t("fields.asset"),
        accessorKey: "assetName",
        cell: (c) => (
          <span className="flex flex-col">
            <span className="font-semibold">{c.row.original.assetCode ?? "—"}</span>
            <span className="text-sm text-[var(--ar-text-muted)]">{c.row.original.assetName ?? ""}</span>
          </span>
        ),
      },
      { header: t("fields.customer"), accessorKey: "customerName", cell: (c) => c.row.original.customerName ?? "—" },
      {
        header: t("fields.status"),
        accessorKey: "status",
        cell: (c) => (
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge kind="rental" status={c.row.original.status} />
            {c.row.original.isOverdue ? <OverdueBadge /> : null}
          </span>
        ),
      },
      {
        header: t("fields.period"),
        accessorKey: "plannedStart",
        cell: (c) => (
          <span className="flex flex-col text-sm">
            <span>{formatDateTime(c.row.original.plannedStart, locale)}</span>
            <span>{formatDateTime(c.row.original.plannedEnd, locale)}</span>
          </span>
        ),
      },
      { header: t("fields.total"), accessorKey: "chargesTotalCents", cell: (c) => (c.row.original.chargesTotalCents === null || c.row.original.chargesTotalCents === undefined ? "—" : formatMoney(c.row.original.chargesTotalCents, locale)) },
    ],
    [t, locale],
  );
  const filtered = filters.q.length > 0 || filters.tab !== "ALL";
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        actions={
          <>
            <button className={buttonVariants({ variant: "secondary" })} onClick={() => setFilters({ view: calendar ? null : "calendar", cursor: null })} type="button">
              {calendar ? <List aria-hidden="true" className="size-4" /> : <CalendarDays aria-hidden="true" className="size-4" />}
              {calendar ? t("calendar.showList") : t("calendar.show")}
            </button>
            <Link className={buttonVariants({ variant: "primary" })} href="/rentals/new">
              <Plus aria-hidden="true" className="size-4" />
              {t("actions.new")}
            </Link>
          </>
        }
        title={t("list.title")}
      />
      {calendar ? (
        <RentalsCalendar anchor={/^\d{4}-\d{2}-\d{2}$/.test(filters.from) ? filters.from : todayIn()} assetId={filters.assetId.length > 0 ? filters.assetId : null} onAnchor={(from) => setFilters({ from })} />
      ) : (
        <>
      <div aria-label={t("list.tabsLabel")} className="flex flex-wrap gap-2" role="tablist">
        {RENTAL_TABS.map((tab) => (
          <button
            aria-selected={filters.tab === tab}
            className={cn(buttonVariants({ variant: filters.tab === tab ? "primary" : "secondary" }))}
            key={tab}
            onClick={() => setFilters({ tab, cursor: null })}
            role="tab"
            type="button"
          >
            {t(`tabs.${tab}`)}
          </button>
        ))}
      </div>
      <DataTable
        caption={t("list.title")}
        columns={columns}
        empty={
          <EmptyState
            action={
              filtered ? undefined : (
                <Link className={buttonVariants({ variant: "primary" })} href="/rentals/new">
                  <Plus aria-hidden="true" className="size-4" />
                  {t("actions.new")}
                </Link>
              )
            }
            body={filtered ? common("states.noMatchesBody") : t("list.emptyBody")}
            icon={<Truck className="size-8" />}
            title={filtered ? common("states.noMatches") : t("list.emptyTitle")}
          />
        }
        error={query.error}
        hasPrevious={filters.cursor.length > 0}
        isLoading={query.isLoading}
        nextCursor={query.data?.nextCursor ?? null}
        onFirst={() => setFilters({ cursor: null })}
        onNext={(cursor) => setFilters({ cursor })}
        onRetry={() => void query.refetch()}
        onRowClick={(row) => router.push(`/rentals/${row.id}`)}
        rowKey={(row) => row.id}
        rows={query.data?.items}
        toolbar={<Input aria-label={common("filters.search")} className="max-w-xs" defaultValue={filters.q} onChange={(e) => setFilters({ q: e.target.value, cursor: null })} placeholder={t("list.searchPlaceholder")} type="search" />}
      />
        </>
      )}
    </div>
  );
}
