"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Plus, ReceiptText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { DataTable } from "@/components/data/DataTable";
import { FilterBar } from "@/components/data/FilterBar";
import { EmptyState } from "@/components/data/States";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { ListPage } from "@/lib/forms";
import { useUrlState } from "@/lib/url-state";

import { BillingCreateDialog } from "./BillingCreateDialog";
import { BillingStatusBadge } from "./BillingStatusBadge";
import { BILLING_SOURCES, BILLING_TABS, tabStatus, type BillingDocumentDTO } from "./types";

const KEYS = ["tab", "source", "cursor"] as const;
const DEFAULTS = { tab: "ALL" } as const;

/** Office billing list (ERP-08): status tabs and the source filter live in the URL. */
export function BillingListPage() {
  const t = useTranslations("billing");
  const common = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [filters, setFilters] = useUrlState(KEYS, DEFAULTS);
  const [creating, setCreating] = useState(false);
  const query = useQuery({
    queryKey: ["billing", "list", filters],
    queryFn: () =>
      api<ListPage<BillingDocumentDTO>>("/billing-documents", {
        query: { status: tabStatus(filters.tab), source: filters.source.length > 0 ? filters.source : undefined, cursor: filters.cursor.length > 0 ? filters.cursor : undefined, limit: 50 },
      }),
    placeholderData: keepPreviousData,
  });
  const columns = useMemo<ColumnDef<BillingDocumentDTO, unknown>[]>(
    () => [
      { header: t("fields.number"), accessorKey: "number", cell: (c) => <span className="font-mono font-semibold">{c.row.original.number}</span> },
      {
        header: t("fields.source"),
        accessorKey: "source",
        cell: (c) => (
          <span className="flex flex-col">
            <span>{t(`source.${c.row.original.source}`)}</span>
            <span className="font-mono text-sm text-[var(--ar-text-muted)]">{c.row.original.sourceNumber ?? ""}</span>
          </span>
        ),
      },
      { header: t("fields.customer"), accessorKey: "customerName", cell: (c) => c.row.original.customerName ?? "—" },
      { header: t("fields.status"), accessorKey: "status", cell: (c) => <BillingStatusBadge status={c.row.original.status} /> },
      { header: t("fields.issuedAt"), accessorKey: "issuedAt", cell: (c) => (c.row.original.issuedAt === null ? "—" : formatDateTime(c.row.original.issuedAt, locale)) },
      { header: t("fields.total"), accessorKey: "totalCents", cell: (c) => <span className="font-semibold">{formatMoney(c.row.original.totalCents, locale)}</span> },
    ],
    [t, locale],
  );
  const filtered = filters.tab !== "ALL" || filters.source.length > 0;
  const newButton = (
    <Button icon={<Plus aria-hidden="true" className="size-4" />} onClick={() => setCreating(true)} variant="primary">
      {t("actions.new")}
    </Button>
  );
  return (
    <div className="flex flex-col gap-4">
      <PageHeader actions={newButton} title={t("list.title")} />
      <div aria-label={t("list.tabsLabel")} className="flex flex-wrap gap-2" role="tablist">
        {BILLING_TABS.map((tab) => (
          <button aria-selected={filters.tab === tab} className={cn(buttonVariants({ variant: filters.tab === tab ? "primary" : "secondary" }))} key={tab} onClick={() => setFilters({ tab, cursor: null })} role="tab" type="button">
            {t(`tabs.${tab}`)}
          </button>
        ))}
      </div>
      <DataTable
        caption={t("list.title")}
        columns={columns}
        empty={<EmptyState action={filtered ? undefined : newButton} body={filtered ? common("states.noMatchesBody") : t("list.emptyBody")} icon={<ReceiptText className="size-8" />} title={filtered ? common("states.noMatches") : t("list.emptyTitle")} />}
        error={query.error}
        hasPrevious={filters.cursor.length > 0}
        isLoading={query.isLoading}
        nextCursor={query.data?.nextCursor ?? null}
        onFirst={() => setFilters({ cursor: null })}
        onNext={(cursor) => setFilters({ cursor })}
        onRetry={() => void query.refetch()}
        onRowClick={(row) => router.push(`/billing/${row.id}`)}
        rowKey={(row) => row.id}
        rows={query.data?.items}
        isRefreshing={query.isPlaceholderData}
        toolbar={
          <FilterBar
            active={filtered}
            page={query.data}
            onClear={() => setFilters({ tab: null, source: null, cursor: null })}
            selects={
              <Select aria-label={t("fields.source")} onChange={(e) => setFilters({ source: e.target.value.length > 0 ? e.target.value : null, cursor: null })} value={filters.source}>
                <option value="">{t("list.allSources")}</option>
                {BILLING_SOURCES.map((source) => (
                  <option key={source} value={source}>
                    {t(`source.${source}`)}
                  </option>
                ))}
              </Select>
            }
          />
        }
      />
      {creating ? <BillingCreateDialog onClose={() => setCreating(false)} onCreated={(doc) => router.push(`/billing/${doc.id}`)} prefill={null} source={null} /> : null}
    </div>
  );
}
