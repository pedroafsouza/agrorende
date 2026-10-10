"use client";

import type { ChecklistTemplateDTO } from "@agrorende/contracts/dto";
import { ChecklistKindEnum } from "@agrorende/contracts/enums";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardList, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { DataTable } from "@/components/data/DataTable";
import { FilterBar } from "@/components/data/FilterBar";
import { EmptyState } from "@/components/data/States";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { buttonVariants } from "@/components/ui/Button";
import { Checkbox, Select } from "@/components/ui/Field";
import { api } from "@/lib/api";
import type { ListPage } from "@/lib/forms";
import { useUrlState } from "@/lib/url-state";

const KEYS = ["kind", "includeArchived"] as const;

export function TemplatesListPage() {
  const t = useTranslations("templates");
  const common = useTranslations("common");
  const router = useRouter();
  const [filters, setFilters] = useUrlState(KEYS);
  const query = useQuery({ queryKey: ["checklist-templates", filters], queryFn: () => api<ListPage<ChecklistTemplateDTO>>("/checklist-templates", { query: filters }), placeholderData: keepPreviousData });
  const columns = useMemo<ColumnDef<ChecklistTemplateDTO, unknown>[]>(
    () => [
      { header: t("fields.name"), accessorKey: "name", cell: (c) => <span className="font-semibold">{c.row.original.name}</span> },
      { header: t("fields.appliesTo"), accessorKey: "appliesTo", cell: (c) => c.row.original.appliesTo.map((k) => t(`kind.${k}`)).join(", ") },
      { header: t("fields.version"), accessorKey: "templateVersion", cell: (c) => t("version", { n: c.row.original.templateVersion }) },
      { header: t("fields.items"), id: "items", cell: (c) => c.row.original.items.length },
      {
        header: t("fields.status"),
        id: "status",
        cell: (c) => {
          const row = c.row.original;
          if (row.archivedAt !== null && row.archivedAt !== undefined) return <Badge tone="neutral">{common("states.archived")}</Badge>;
          return row.isActive ? <Badge tone="success">{common("states.active")}</Badge> : <Badge tone="warning">{common("states.inactive")}</Badge>;
        },
      },
    ],
    [t, common],
  );
  const newLink = (
    <Link className={buttonVariants({ variant: "primary" })} href="/templates/new">
      <Plus aria-hidden="true" className="size-4" />
      {t("actions.new")}
    </Link>
  );
  return (
    <div className="flex flex-col gap-4">
      <PageHeader actions={newLink} subtitle={t("list.subtitle")} title={t("list.title")} />
      <DataTable
        caption={t("list.title")}
        columns={columns}
        empty={<EmptyState action={newLink} body={t("list.emptyBody")} icon={<ClipboardList className="size-8" />} title={t("list.emptyTitle")} />}
        error={query.error}
        isLoading={query.isLoading}
        nextCursor={null}
        onRetry={() => void query.refetch()}
        onRowClick={(row) => router.push(`/templates/${row.id}`)}
        rowKey={(row) => row.id}
        rows={query.data?.items}
        isRefreshing={query.isPlaceholderData}
        toolbar={
          <FilterBar
            active={filters.kind.length > 0 || filters.includeArchived === "true"}
            page={query.data}
            onClear={() => setFilters({ kind: null, includeArchived: null })}
            selects={
              <Select aria-label={t("fields.appliesTo")} onChange={(e) => setFilters({ kind: e.target.value })} value={filters.kind}>
                <option value="">{t("list.allKinds")}</option>
                {ChecklistKindEnum.options.map((k) => (
                  <option key={k} value={k}>
                    {t(`kind.${k}`)}
                  </option>
                ))}
              </Select>
            }
            toggles={<Checkbox checked={filters.includeArchived === "true"} label={common("filters.includeArchived")} onChange={(e) => setFilters({ includeArchived: e.target.checked ? "true" : null })} />}
          />
        }
      />
    </div>
  );
}
