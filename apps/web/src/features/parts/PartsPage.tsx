"use client";

import { AssetCategoryEnum } from "@agrorende/contracts/enums";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Package, Pencil, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DataTable } from "@/components/data/DataTable";
import { EmptyState } from "@/components/data/States";
import { FormDialog } from "@/components/forms/FormDialog";
import { MoneyInput } from "@/components/forms/MoneyInput";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { formatMoney, formatNumber } from "@/lib/format";
import { useFieldErrors, type ListPage } from "@/lib/forms";
import { useSave } from "@/lib/useSave";

import { EMPTY_PART_FORM, partBody, type PartDTO, type PartFormValues } from "./types";

const valuesOf = (part: PartDTO): PartFormValues => ({
  sku: part.sku,
  name: part.name,
  unit: part.unit,
  unitCostCents: part.unitCostCents ?? null,
  minStock: part.minStock === null || part.minStock === undefined ? "" : String(part.minStock),
  compatibleCategories: [...part.compatibleCategories],
});

/** Office parts catalog (ERP-05): search, create, edit and archive. */
export function PartsPage() {
  const t = useTranslations("parts");
  const common = useTranslations("common");
  const locale = useLocale();
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [target, setTarget] = useState<PartDTO | "new" | null>(null);
  const [values, setValues] = useState<PartFormValues>(EMPTY_PART_FORM);
  const list = useQuery({
    queryKey: ["parts", { q, showArchived }],
    queryFn: () => api<ListPage<PartDTO>>("/parts", { query: { q: q.trim().length > 0 ? q.trim() : undefined, includeArchived: showArchived ? "true" : undefined } }),
  });
  const [save, state] = useSave(
    "parts",
    (input: { target: PartDTO | "new"; body: Record<string, unknown> }) =>
      input.target === "new" ? api<PartDTO>("/parts", { method: "POST", body: input.body }) : api<PartDTO>(`/parts/${input.target.id}`, { method: "PATCH", body: input.body, version: input.target.syncVersion }),
    () => {
      setTarget(null);
      toast.success(common("toast.saved"));
    },
  );
  const [archive, archiveState] = useSave(
    "parts",
    (part: PartDTO) => api<PartDTO>(`/parts/${part.id}`, { method: "PATCH", body: { archived: part.archivedAt === null || part.archivedAt === undefined }, version: part.syncVersion }),
    (part) => toast.success(part.archivedAt === null || part.archivedAt === undefined ? t("catalog.restoredToast") : t("catalog.archivedToast")),
  );
  const fe = useFieldErrors()(state.error);
  const open = (part: PartDTO | "new") => {
    setValues(part === "new" ? EMPTY_PART_FORM : valuesOf(part));
    state.reset();
    setTarget(part);
  };
  const set = <K extends keyof PartFormValues>(key: K, value: PartFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));

  const columns = useMemo<ColumnDef<PartDTO, unknown>[]>(
    () => [
      { header: t("fields.sku"), accessorKey: "sku", cell: (c) => <span className="font-mono font-semibold">{c.row.original.sku}</span> },
      { header: t("fields.name"), accessorKey: "name" },
      { header: t("fields.unit"), accessorKey: "unit" },
      { header: t("fields.unitCost"), accessorKey: "unitCostCents", cell: (c) => formatMoney(c.row.original.unitCostCents ?? null, locale) || "—" },
      { header: t("fields.minStock"), accessorKey: "minStock", cell: (c) => (c.row.original.minStock === null || c.row.original.minStock === undefined ? "—" : formatNumber(c.row.original.minStock, locale, 2)) },
      {
        header: t("fields.categories"),
        id: "categories",
        cell: (c) => (c.row.original.compatibleCategories.length === 0 ? "—" : c.row.original.compatibleCategories.map((x) => common(`category.${x}`)).join(", ")),
      },
      {
        header: t("fields.status"),
        id: "status",
        cell: (c) => (c.row.original.archivedAt === null || c.row.original.archivedAt === undefined ? <Badge tone="success">{t("catalog.active")}</Badge> : <Badge tone="neutral">{t("catalog.archived")}</Badge>),
      },
      {
        header: "",
        id: "actions",
        cell: (c) => {
          const part = c.row.original;
          const archived = part.archivedAt !== null && part.archivedAt !== undefined;
          return (
            <span className="flex flex-wrap gap-2">
              <Button icon={<Pencil aria-hidden="true" className="size-4" />} onClick={() => open(part)} variant="ghost">
                {common("actions.edit")}
              </Button>
              <Button busy={archiveState.busy} icon={archived ? <ArchiveRestore aria-hidden="true" className="size-4" /> : <Archive aria-hidden="true" className="size-4" />} onClick={() => void archive(part)} variant="ghost">
                {archived ? t("catalog.restore") : t("catalog.archive")}
              </Button>
            </span>
          );
        },
      },
    ],
    [t, common, locale, archiveState.busy],
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        actions={
          <Button icon={<Plus aria-hidden="true" className="size-4" />} onClick={() => open("new")} variant="primary">
            {t("catalog.new")}
          </Button>
        }
        subtitle={t("catalog.subtitle")}
        title={t("catalog.title")}
      />
      {archiveState.error === null ? null : <ErrorAlert error={archiveState.error} onRetry={() => void list.refetch()} />}
      <DataTable
        caption={t("catalog.title")}
        columns={columns}
        empty={
          q.trim().length > 0 ? (
            <EmptyState body={common("states.noMatchesBody")} icon={<Package className="size-8" />} title={common("states.noMatches")} />
          ) : (
            <EmptyState action={<Button onClick={() => open("new")} variant="primary">{t("catalog.new")}</Button>} body={t("catalog.emptyBody")} icon={<Package className="size-8" />} title={t("catalog.emptyTitle")} />
          )
        }
        error={list.error}
        isLoading={list.isLoading}
        onRetry={() => void list.refetch()}
        rowKey={(row) => row.id}
        rows={list.data?.items}
        toolbar={
          <>
            <div className="w-full max-w-xs">
              <Field label={t("catalog.search")}>{(p) => <Input {...p} onChange={(e) => setQ(e.target.value)} type="search" value={q} />}</Field>
            </div>
            <Checkbox checked={showArchived} label={t("catalog.showArchived")} onChange={(e) => setShowArchived(e.target.checked)} />
          </>
        }
      />
      <FormDialog
        busy={state.busy}
        dirty
        error={state.error}
        formId="part-form"
        onClose={() => setTarget(null)}
        onSubmit={() => (target === null ? undefined : void save({ target, body: partBody(values) }))}
        open={target !== null}
        size="lg"
        title={target === "new" ? t("catalog.newTitle") : t("catalog.editTitle")}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field error={fe.sku} label={t("fields.sku")} required>
            {(p) => <Input {...p} onChange={(e) => set("sku", e.target.value)} value={values.sku} />}
          </Field>
          <Field error={fe.name} label={t("fields.name")} required>
            {(p) => <Input {...p} onChange={(e) => set("name", e.target.value)} value={values.name} />}
          </Field>
          <Field error={fe.unit} label={t("fields.unit")} required>
            {(p) => <Input {...p} onChange={(e) => set("unit", e.target.value)} value={values.unit} />}
          </Field>
          <Field error={fe.unitCostCents} label={t("fields.unitCost")}>
            {(p) => <MoneyInput {...p} cents={values.unitCostCents} onChange={(cents) => set("unitCostCents", cents)} />}
          </Field>
          <Field error={fe.minStock} hint={t("fields.minStockHint")} label={t("fields.minStock")}>
            {(p) => <Input {...p} inputMode="decimal" onChange={(e) => set("minStock", e.target.value)} value={values.minStock} />}
          </Field>
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-sm font-semibold">{t("fields.categories")}</legend>
            <div className="flex flex-wrap gap-x-4">
              {AssetCategoryEnum.options.map((c) => (
                <Checkbox
                  checked={values.compatibleCategories.includes(c)}
                  key={c}
                  label={common(`category.${c}`)}
                  onChange={(e) => set("compatibleCategories", e.target.checked ? [...values.compatibleCategories, c] : values.compatibleCategories.filter((x) => x !== c))}
                />
              ))}
            </div>
          </fieldset>
        </div>
      </FormDialog>
    </div>
  );
}
