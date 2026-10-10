"use client";

import { OrgStatusEnum, type OrgStatus } from "@agrorende/contracts/enums";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import type { PlatformOrgRowDTO } from "@agrorende/core/modules/tenancy/dto";

import { DataTable } from "@/components/data/DataTable";
import { FilterBar, FilterSearch } from "@/components/data/FilterBar";
import { EmptyState } from "@/components/data/States";
import { PageHeader } from "@/components/shell/PageHeader";
import { Field, Select } from "@/components/ui/Field";
import { OrgStatusBadge } from "@/features/tenancy/OrgStatusBadge";
import { formatDay } from "@/features/tenancy/TenancyOrgBanner";
import { useUrlState } from "@/lib/url-state";

import { platformApi } from "./platformApi";

const KEYS = ["q", "status"] as const;

function isStatus(value: string): value is OrgStatus {
  return (OrgStatusEnum.options as readonly string[]).includes(value);
}

/** `/platform/orgs`: every organisation with status, plan, dates and latest usage. Metadata only (TEN-06). */
export function PlatformOrgsPage() {
  const t = useTranslations("platform");
  const tenancy = useTranslations("tenancy");
  const locale = useLocale();
  const router = useRouter();
  const [filters, setFilters] = useUrlState(KEYS);
  const status = isStatus(filters.status) ? filters.status : undefined;
  const query = useQuery({
    queryKey: ["platform", "orgs", filters.q, status],
    queryFn: () => platformApi<{ items: PlatformOrgRowDTO[] }>("/orgs", { query: { q: filters.q, status } }),
    placeholderData: keepPreviousData,
  });
  const number = new Intl.NumberFormat(locale);

  const columns = useMemo<ColumnDef<PlatformOrgRowDTO, unknown>[]>(
    () => [
      { id: "name", header: t("orgs.columns.name"), cell: ({ row }) => <span className="font-semibold">{row.original.name}</span> },
      { id: "status", header: t("orgs.columns.status"), cell: ({ row }) => <OrgStatusBadge status={row.original.status} /> },
      { id: "plan", header: t("orgs.columns.plan"), cell: ({ row }) => row.original.plan },
      {
        id: "dates",
        header: t("orgs.columns.keyDate"),
        cell: ({ row }) => {
          const org = row.original;
          if (org.status === "TRIAL" && org.trialEndsAt !== null) return t("orgs.trialEnds", { date: formatDay(org.trialEndsAt, locale, undefined) });
          if (org.status === "CANCELLED" && org.purgeAfter !== null) return t("orgs.purgeAfter", { date: formatDay(org.purgeAfter, locale, undefined) });
          if (org.status === "PAST_DUE" && org.pastDueAt !== null) return t("orgs.pastDueSince", { date: formatDay(org.pastDueAt, locale, undefined) });
          if (org.status === "SUSPENDED" && org.suspendedAt !== null) return t("orgs.suspendedSince", { date: formatDay(org.suspendedAt, locale, undefined) });
          return "—";
        },
      },
      { id: "fieldUsers", header: t("orgs.columns.fieldUsers"), cell: ({ row }) => (row.original.latestUsage === null ? "—" : number.format(row.original.latestUsage.activeFieldUsers)) },
      { id: "assets", header: t("orgs.columns.assets"), cell: ({ row }) => (row.original.latestUsage === null ? "—" : number.format(row.original.latestUsage.assetCount)) },
      { id: "createdAt", header: t("orgs.columns.createdAt"), cell: ({ row }) => formatDay(row.original.createdAt, locale, undefined) },
    ],
    [t, locale, number],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader subtitle={t("orgs.subtitle")} title={t("orgs.title")} />
      <DataTable
        caption={t("orgs.title")}
        columns={columns}
        empty={<EmptyState body={t("orgs.emptyBody")} icon={<Building2 className="size-8" />} title={t("orgs.empty")} />}
        error={query.error}
        isLoading={query.isLoading}
        onRetry={() => void query.refetch()}
        onRowClick={(row) => router.push(`/platform/orgs/${row.id}`)}
        rowKey={(row) => row.id}
        rows={query.data?.items}
        isRefreshing={query.isPlaceholderData}
        toolbar={
          <FilterBar
            active={filters.q.length > 0 || status !== undefined}
            page={query.data}
            onClear={() => setFilters({ q: null, status: null })}
            search={<Field label={t("orgs.search")}>{(p) => <FilterSearch {...p} name="q" onSearch={(q) => setFilters({ q })} value={filters.q} />}</Field>}
            selects={
            <Field label={t("orgs.statusFilter")}>
              {(p) => (
                <Select {...p} name="status" onChange={(e) => setFilters({ status: e.target.value.length === 0 ? null : e.target.value })} value={status ?? ""}>
                  <option value="">{t("orgs.allStatuses")}</option>
                  {OrgStatusEnum.options.map((value) => (
                    <option key={value} value={value}>
                      {tenancy(`status.${value}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            }
          />
        }
      />
    </div>
  );
}
