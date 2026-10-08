"use client";

import type { SiteDTO } from "@agrorende/contracts/dto";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { MapPin, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { DataTable } from "@/components/data/DataTable";
import { EmptyState } from "@/components/data/States";
import { FormDialog } from "@/components/forms/FormDialog";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input, Select } from "@/components/ui/Field";
import { api } from "@/lib/api";
import type { ListPage } from "@/lib/forms";
import { useSave } from "@/lib/useSave";
import { useUrlState } from "@/lib/url-state";

import { SITE_TYPES, SiteFields, siteBody, siteFormValues } from "./SiteForm";

const KEYS = ["q", "type", "includeArchived", "cursor"] as const;

export function SitesListPage() {
  const t = useTranslations("assets");
  const common = useTranslations("common");
  const router = useRouter();
  const [filters, setFilters] = useUrlState(KEYS);
  const [creating, setCreating] = useState(false);
  const [values, setValues] = useState(siteFormValues());
  const query = useQuery({ queryKey: ["sites", filters], queryFn: () => api<ListPage<SiteDTO>>("/sites", { query: { ...filters, limit: 50 } }) });
  const [create, state] = useSave("sites", (body: Record<string, unknown>) => api<SiteDTO>("/sites", { method: "POST", body }), (site) => router.push(`/sites/${site.id}`));
  const columns = useMemo<ColumnDef<SiteDTO, unknown>[]>(
    () => [
      { header: t("sites.fields.name"), accessorKey: "name", cell: (c) => <span className="font-semibold">{c.row.original.name}</span> },
      { header: t("sites.fields.type"), accessorKey: "type", cell: (c) => t(`sites.type.${c.row.original.type}`) },
      { header: t("sites.fields.city"), accessorKey: "city", cell: (c) => [c.row.original.city, c.row.original.state].filter(Boolean).join(" · ") },
      { header: t("sites.fields.status"), accessorKey: "archivedAt", cell: (c) => (c.row.original.archivedAt === null || c.row.original.archivedAt === undefined ? common("states.active") : common("states.archived")) },
    ],
    [t, common],
  );
  const open = () => {
    setValues(siteFormValues());
    state.reset();
    setCreating(true);
  };
  const filtered = filters.q.length > 0 || filters.type.length > 0;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader actions={<Button icon={<Plus aria-hidden="true" className="size-4" />} onClick={open} variant="primary">{t("sites.actions.new")}</Button>} title={t("sites.list.title")} />
      <DataTable
        caption={t("sites.list.title")}
        columns={columns}
        empty={
          <EmptyState
            action={filtered ? undefined : <Button onClick={open} variant="primary">{t("sites.actions.new")}</Button>}
            body={filtered ? common("states.noMatchesBody") : t("sites.list.emptyBody")}
            icon={<MapPin className="size-8" />}
            title={filtered ? common("states.noMatches") : t("sites.list.emptyTitle")}
          />
        }
        error={query.error}
        hasPrevious={filters.cursor.length > 0}
        isLoading={query.isLoading}
        nextCursor={query.data?.nextCursor ?? null}
        onFirst={() => setFilters({ cursor: null })}
        onNext={(cursor) => setFilters({ cursor })}
        onRetry={() => void query.refetch()}
        onRowClick={(row) => router.push(`/sites/${row.id}`)}
        rowKey={(row) => row.id}
        rows={query.data?.items}
        toolbar={
          <>
            <Input aria-label={common("filters.search")} className="max-w-xs" defaultValue={filters.q} onChange={(e) => setFilters({ q: e.target.value })} placeholder={t("sites.list.searchPlaceholder")} type="search" />
            <Select aria-label={t("sites.fields.type")} className="max-w-48" onChange={(e) => setFilters({ type: e.target.value })} value={filters.type}>
              <option value="">{t("sites.list.allTypes")}</option>
              {SITE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`sites.type.${type}`)}
                </option>
              ))}
            </Select>
            <Checkbox checked={filters.includeArchived === "true"} label={common("filters.includeArchived")} onChange={(e) => setFilters({ includeArchived: e.target.checked ? "true" : null })} />
          </>
        }
      />
      <FormDialog busy={state.busy} dirty={JSON.stringify(values) !== JSON.stringify(siteFormValues())} error={state.error} formId="site-new" onClose={() => setCreating(false)} onSubmit={() => void create(siteBody(values))} open={creating} size="lg" submitLabel={t("sites.actions.create")} title={t("sites.new.title")}>
        <SiteFields error={state.error} onChange={setValues} values={values} />
      </FormDialog>
    </div>
  );
}
