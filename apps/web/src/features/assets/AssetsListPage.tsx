"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Tractor } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import { ConditionBadge } from "@/components/data/badges";
import { DataTable } from "@/components/data/DataTable";
import { EmptyState } from "@/components/data/States";
import { PageHeader } from "@/components/shell/PageHeader";
import { buttonVariants } from "@/components/ui/Button";
import { Checkbox, Input, Select } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import type { ListPage } from "@/lib/forms";
import { useUrlState } from "@/lib/url-state";

import { CATEGORIES, CONDITIONS, type AssetDTO } from "./types";

const KEYS = ["q", "category", "condition", "includeRetired", "cursor"] as const;

export function AssetsListPage() {
  const t = useTranslations("assets");
  const common = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [filters, setFilters] = useUrlState(KEYS);
  const query = useQuery({
    queryKey: ["assets", filters],
    queryFn: () => api<ListPage<AssetDTO>>("/assets", { query: { ...filters, limit: 50 } }),
  });
  const columns = useMemo<ColumnDef<AssetDTO, unknown>[]>(
    () => [
      { header: t("fields.code"), accessorKey: "code", cell: (c) => <span className="font-mono font-semibold">{c.row.original.code}</span> },
      { header: t("fields.name"), accessorKey: "name" },
      { header: t("fields.category"), accessorKey: "category", cell: (c) => common(`category.${c.row.original.category}`) },
      { header: t("fields.condition"), accessorKey: "condition", cell: (c) => <ConditionBadge condition={c.row.original.condition} /> },
      { header: t("fields.hourMeter"), accessorKey: "hourMeter", cell: (c) => formatNumber(c.row.original.hourMeter, locale, 1) },
      { header: t("fields.isRentable"), accessorKey: "isRentable", cell: (c) => (c.row.original.isRentable ? common("yes") : common("no")) },
    ],
    [t, common, locale],
  );
  const filtered = filters.q.length > 0 || filters.category.length > 0 || filters.condition.length > 0;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        actions={
          <Link className={buttonVariants({ variant: "primary" })} href="/assets/new">
            <Plus aria-hidden="true" className="size-4" />
            {t("actions.new")}
          </Link>
        }
        title={t("list.title")}
      />
      <DataTable
        caption={t("list.title")}
        columns={columns}
        empty={
          <EmptyState
            action={
              filtered ? undefined : (
                <Link className={buttonVariants({ variant: "primary" })} href="/assets/new">
                  {t("actions.new")}
                </Link>
              )
            }
            body={filtered ? common("states.noMatchesBody") : t("list.emptyBody")}
            icon={<Tractor className="size-8" />}
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
        onRowClick={(row) => router.push(`/assets/${row.id}`)}
        rowKey={(row) => row.id}
        rows={query.data?.items}
        toolbar={
          <>
            <Input aria-label={common("filters.search")} className="max-w-xs" defaultValue={filters.q} onChange={(e) => setFilters({ q: e.target.value })} placeholder={t("list.searchPlaceholder")} type="search" />
            <Select aria-label={t("fields.category")} className="max-w-48" onChange={(e) => setFilters({ category: e.target.value })} value={filters.category}>
              <option value="">{t("list.allCategories")}</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {common(`category.${c}`)}
                </option>
              ))}
            </Select>
            <Select aria-label={t("fields.condition")} className="max-w-48" onChange={(e) => setFilters({ condition: e.target.value })} value={filters.condition}>
              <option value="">{t("list.allConditions")}</option>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {common(`condition.${c}`)}
                </option>
              ))}
            </Select>
            <Checkbox checked={filters.includeRetired === "true"} label={t("list.includeRetired")} onChange={(e) => setFilters({ includeRetired: e.target.checked ? "true" : null })} />
          </>
        }
      />
    </div>
  );
}
