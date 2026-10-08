"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertOctagon, ClipboardList, Images } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import { PriorityBadge, StatusBadge } from "@/components/data/badges";
import { DataTable } from "@/components/data/DataTable";
import { EmptyState } from "@/components/data/States";
import { PageHeader } from "@/components/shell/PageHeader";
import { Input, Select } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { ListPage } from "@/lib/forms";
import { useUrlState } from "@/lib/url-state";

import { ALL, PRIORITIES, REPORT_STATUSES, TRIAGE_STATUSES, statusQuery, type FieldReportListItem } from "./types";

const KEYS = ["status", "priority", "siteId", "q", "from", "to", "cursor"] as const;
const DEFAULTS = { status: TRIAGE_STATUSES } as const;

/** Office triage inbox (F1): newest first, filters live in the URL so a link reproduces the view. */
export function ReportsInboxPage() {
  const t = useTranslations("reports");
  const common = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [filters, setFilters] = useUrlState(KEYS, DEFAULTS);
  const query = useQuery({
    queryKey: ["field-reports", filters],
    queryFn: () =>
      api<ListPage<FieldReportListItem>>("/field-reports", {
        query: {
          status: statusQuery(filters.status),
          priority: filters.priority.length > 0 ? filters.priority : undefined,
          siteId: filters.siteId.length > 0 ? filters.siteId : undefined,
          q: filters.q.length > 0 ? filters.q : undefined,
          from: filters.from.length > 0 ? filters.from : undefined,
          to: filters.to.length > 0 ? filters.to : undefined,
          cursor: filters.cursor.length > 0 ? filters.cursor : undefined,
          limit: 50,
        },
      }),
  });
  const sites = useQuery({ queryKey: ["sites", { picker: true }], queryFn: () => api<ListPage<{ id: string; name: string }>>("/sites", { query: { limit: 100 } }) });
  const columns = useMemo<ColumnDef<FieldReportListItem, unknown>[]>(
    () => [
      { header: t("fields.number"), accessorKey: "number", cell: (c) => <span className="font-mono font-semibold">{c.row.original.number ?? "—"}</span> },
      {
        header: t("fields.title"),
        accessorKey: "title",
        cell: (c) => {
          const r = c.row.original;
          return (
            <span className="flex flex-col">
              <span className="font-semibold">{r.title}</span>
              <span className="text-sm text-[var(--ar-text-muted)]">
                {r.assetCode === null ? t("unregistered", { description: r.unregisteredAssetDesc ?? "—" }) : `${r.assetCode} · ${r.assetName ?? ""}`}
              </span>
            </span>
          );
        },
      },
      {
        header: t("fields.priority"),
        accessorKey: "priority",
        cell: (c) => (
          <span className="flex flex-wrap items-center gap-2">
            <PriorityBadge priority={c.row.original.priority} />
            {c.row.original.machineOperable ? null : (
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--ar-danger)]">
                <AlertOctagon aria-hidden="true" className="size-4" />
                {t("notOperable")}
              </span>
            )}
          </span>
        ),
      },
      { header: t("fields.status"), accessorKey: "status", cell: (c) => <StatusBadge kind="report" status={c.row.original.status} /> },
      { header: t("fields.category"), accessorKey: "category", cell: (c) => t(`category.${c.row.original.category}`) },
      { header: t("fields.site"), accessorKey: "siteName", cell: (c) => c.row.original.siteName ?? "—" },
      { header: t("fields.reporter"), accessorKey: "reporterName", cell: (c) => c.row.original.reporterName ?? "—" },
      { header: t("fields.occurredAt"), accessorKey: "occurredAt", cell: (c) => formatDateTime(c.row.original.occurredAt, locale) },
      {
        header: t("fields.media"),
        accessorKey: "mediaCount",
        cell: (c) => (
          <span className="inline-flex items-center gap-1">
            <Images aria-hidden="true" className="size-4" />
            {c.row.original.mediaCount}
          </span>
        ),
      },
    ],
    [t, locale],
  );
  const filtered = filters.q.length > 0 || filters.priority.length > 0 || filters.siteId.length > 0 || filters.from.length > 0 || filters.to.length > 0 || filters.status !== TRIAGE_STATUSES;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("inbox.title")} />
      <DataTable
        caption={t("inbox.title")}
        columns={columns}
        empty={<EmptyState body={filtered ? common("states.noMatchesBody") : t("inbox.emptyBody")} icon={<ClipboardList className="size-8" />} title={filtered ? common("states.noMatches") : t("inbox.emptyTitle")} />}
        error={query.error}
        hasPrevious={filters.cursor.length > 0}
        isLoading={query.isLoading}
        nextCursor={query.data?.nextCursor ?? null}
        onFirst={() => setFilters({ cursor: null })}
        onNext={(cursor) => setFilters({ cursor })}
        onRetry={() => void query.refetch()}
        onRowClick={(row) => router.push(`/reports/${row.id}`)}
        rowKey={(row) => row.id}
        rows={query.data?.items}
        toolbar={
          <>
            <Input aria-label={common("filters.search")} className="max-w-xs" defaultValue={filters.q} onChange={(e) => setFilters({ q: e.target.value, cursor: null })} placeholder={t("inbox.searchPlaceholder")} type="search" />
            <Select aria-label={t("fields.status")} className="max-w-56" onChange={(e) => setFilters({ status: e.target.value, cursor: null })} value={filters.status}>
              <option value={TRIAGE_STATUSES}>{t("inbox.needsTriage")}</option>
              <option value={ALL}>{t("inbox.allStatuses")}</option>
              {REPORT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {common(`status.report.${s}`)}
                </option>
              ))}
            </Select>
            <Select aria-label={t("fields.priority")} className="max-w-48" onChange={(e) => setFilters({ priority: e.target.value, cursor: null })} value={filters.priority}>
              <option value="">{t("inbox.allPriorities")}</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {common(`priority.${p}`)}
                </option>
              ))}
            </Select>
            <Select aria-label={t("fields.site")} className="max-w-56" onChange={(e) => setFilters({ siteId: e.target.value, cursor: null })} value={filters.siteId}>
              <option value="">{t("inbox.allSites")}</option>
              {(sites.data?.items ?? []).map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </Select>
            <label className="flex items-center gap-2 text-sm font-semibold">
              {t("inbox.from")}
              <Input className="max-w-44" onChange={(e) => setFilters({ from: e.target.value.length > 0 ? e.target.value : null, cursor: null })} type="date" value={filters.from} />
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              {t("inbox.to")}
              <Input className="max-w-44" onChange={(e) => setFilters({ to: e.target.value.length > 0 ? e.target.value : null, cursor: null })} type="date" value={filters.to} />
            </label>
          </>
        }
      />
    </div>
  );
}
