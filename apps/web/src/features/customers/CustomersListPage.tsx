"use client";

import type { CustomerDTO } from "@agrorende/contracts/dto";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { DataTable } from "@/components/data/DataTable";
import { EmptyState } from "@/components/data/States";
import { FormDialog } from "@/components/forms/FormDialog";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input } from "@/components/ui/Field";
import { api } from "@/lib/api";
import type { ListPage } from "@/lib/forms";
import { useSave } from "@/lib/useSave";
import { useUrlState } from "@/lib/url-state";

import { CustomerFields, customerBody, customerFormValues } from "./CustomerForm";

const KEYS = ["q", "supplier", "incomplete", "includeArchived", "cursor"] as const;

export function CustomersListPage() {
  const t = useTranslations("assets");
  const common = useTranslations("common");
  const router = useRouter();
  const [filters, setFilters] = useUrlState(KEYS);
  const [creating, setCreating] = useState(false);
  const [values, setValues] = useState(customerFormValues());
  const query = useQuery({ queryKey: ["customers", filters], queryFn: () => api<ListPage<CustomerDTO>>("/customers", { query: { ...filters, limit: 50 } }) });
  const [create, state] = useSave("customers", (body: Record<string, unknown>) => api<CustomerDTO>("/customers", { method: "POST", body }), (c) => router.push(`/customers/${c.id}`));
  const columns = useMemo<ColumnDef<CustomerDTO, unknown>[]>(
    () => [
      {
        header: t("customers.fields.name"),
        accessorKey: "name",
        cell: (c) => (
          <span className="flex flex-wrap items-center gap-2 font-semibold">
            {c.row.original.name}
            {c.row.original.isSupplier ? <Badge tone="info">{t("customers.supplier")}</Badge> : null}
          </span>
        ),
      },
      { header: t("customers.fields.taxId"), accessorKey: "taxIdMasked", cell: (c) => <span className="font-mono">{c.row.original.taxIdMasked ?? "—"}</span> },
      { header: t("customers.fields.phone"), accessorKey: "phone", cell: (c) => c.row.original.phone ?? c.row.original.whatsapp ?? "—" },
      { header: t("customers.fields.city"), accessorKey: "city", cell: (c) => [c.row.original.city, c.row.original.state].filter(Boolean).join(" · ") },
      {
        header: t("customers.fields.status"),
        id: "status",
        cell: (c) => {
          const row = c.row.original;
          if (row.archivedAt !== null && row.archivedAt !== undefined) return <Badge tone="neutral">{common("states.archived")}</Badge>;
          const incomplete = (row.taxIdMasked ?? "") === "" || ((row.phone ?? "") === "" && (row.whatsapp ?? "") === "");
          return incomplete ? <Badge tone="warning">{t("customers.incomplete")}</Badge> : <Badge tone="success">{t("customers.complete")}</Badge>;
        },
      },
    ],
    [t, common],
  );
  const open = () => {
    setValues(customerFormValues());
    state.reset();
    setCreating(true);
  };
  const filtered = filters.q.length > 0 || filters.supplier.length > 0 || filters.incomplete.length > 0;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader actions={<Button icon={<Plus aria-hidden="true" className="size-4" />} onClick={open} variant="primary">{t("customers.actions.new")}</Button>} title={t("customers.list.title")} />
      <DataTable
        caption={t("customers.list.title")}
        columns={columns}
        empty={
          <EmptyState
            action={filtered ? undefined : <Button onClick={open} variant="primary">{t("customers.actions.new")}</Button>}
            body={filtered ? common("states.noMatchesBody") : t("customers.list.emptyBody")}
            icon={<Users className="size-8" />}
            title={filtered ? common("states.noMatches") : t("customers.list.emptyTitle")}
          />
        }
        error={query.error}
        hasPrevious={filters.cursor.length > 0}
        isLoading={query.isLoading}
        nextCursor={query.data?.nextCursor ?? null}
        onFirst={() => setFilters({ cursor: null })}
        onNext={(cursor) => setFilters({ cursor })}
        onRetry={() => void query.refetch()}
        onRowClick={(row) => router.push(`/customers/${row.id}`)}
        rowKey={(row) => row.id}
        rows={query.data?.items}
        toolbar={
          <>
            <Input aria-label={common("filters.search")} className="max-w-xs" defaultValue={filters.q} onChange={(e) => setFilters({ q: e.target.value })} placeholder={t("customers.list.searchPlaceholder")} type="search" />
            <Checkbox checked={filters.supplier === "true"} label={t("customers.list.suppliersOnly")} onChange={(e) => setFilters({ supplier: e.target.checked ? "true" : null })} />
            <Checkbox checked={filters.incomplete === "true"} label={t("customers.list.incompleteOnly")} onChange={(e) => setFilters({ incomplete: e.target.checked ? "true" : null })} />
            <Checkbox checked={filters.includeArchived === "true"} label={common("filters.includeArchived")} onChange={(e) => setFilters({ includeArchived: e.target.checked ? "true" : null })} />
          </>
        }
      />
      <FormDialog busy={state.busy} dirty={JSON.stringify(values) !== JSON.stringify(customerFormValues())} error={state.error} formId="customer-new" onClose={() => setCreating(false)} onSubmit={() => void create(customerBody(values))} open={creating} size="lg" submitLabel={t("customers.actions.create")} title={t("customers.new.title")}>
        <CustomerFields error={state.error} onChange={setValues} values={values} />
      </FormDialog>
    </div>
  );
}
