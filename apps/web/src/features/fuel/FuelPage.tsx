"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fuel, Gauge, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { DataTable } from "@/components/data/DataTable";
import { EmptyState } from "@/components/data/States";
import { EntityPicker } from "@/components/forms/EntityPicker";
import { MoneyInput } from "@/components/forms/MoneyInput";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { useFieldErrors, type ListPage } from "@/lib/forms";
import { useUrlState } from "@/lib/url-state";

import { EMPTY_FUEL_FORM, fuelBody, previewTotalCents, validateFuelForm, type FuelConsumptionDTO, type FuelFormErrors, type FuelFormValues, type FuelLogDTO, type FuelLogListItem } from "./types";

const KEYS = ["assetId", "cursor"] as const;

/** Office fuel page (ERP-07): fill-ups newest first, consumption per machine and office entry. */
export function FuelPage() {
  const t = useTranslations("fuel");
  const common = useTranslations("common");
  const locale = useLocale();
  const [filters, setFilters] = useUrlState(KEYS);
  const [open, setOpen] = useState(false);
  const assetId = filters.assetId.length > 0 ? filters.assetId : null;
  const list = useQuery({
    queryKey: ["fuel", "list", filters],
    queryFn: () => api<ListPage<FuelLogListItem>>("/fuel-logs", { query: { assetId: assetId ?? undefined, cursor: filters.cursor.length > 0 ? filters.cursor : undefined, limit: 50 } }),
  });
  const columns = useMemo<ColumnDef<FuelLogListItem, unknown>[]>(
    () => [
      { header: t("fields.filledAt"), accessorKey: "filledAt", cell: (c) => formatDateTime(c.row.original.filledAt, locale) },
      {
        header: t("fields.asset"),
        accessorKey: "assetCode",
        cell: (c) => (
          <span className="flex flex-col">
            <span className="font-semibold">{c.row.original.assetCode ?? "—"}</span>
            <span className="text-sm text-[var(--ar-text-muted)]">{c.row.original.assetName ?? ""}</span>
          </span>
        ),
      },
      { header: t("fields.liters"), accessorKey: "liters", cell: (c) => `${formatNumber(c.row.original.liters, locale, 1)} L` },
      { header: t("fields.pricePerLiter"), accessorKey: "pricePerLiterCents", cell: (c) => formatMoney(c.row.original.pricePerLiterCents ?? null, locale) || "—" },
      { header: t("fields.total"), accessorKey: "totalCents", cell: (c) => (c.row.original.totalCents === null || c.row.original.totalCents === undefined ? "—" : formatMoney(c.row.original.totalCents, locale)) },
      { header: t("fields.hourMeter"), accessorKey: "hourMeter", cell: (c) => (c.row.original.hourMeter === null || c.row.original.hourMeter === undefined ? "—" : `${formatNumber(c.row.original.hourMeter, locale, 1)} h`) },
    ],
    [t, locale],
  );
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        actions={
          <Button icon={<Plus aria-hidden="true" className="size-4" />} onClick={() => setOpen(true)} variant="primary">
            {t("actions.new")}
          </Button>
        }
        title={t("title")}
      />
      {assetId === null ? <p className="text-sm text-[var(--ar-text-muted)]">{t("consumption.chooseAsset")}</p> : <ConsumptionCard assetId={assetId} />}
      <DataTable
        caption={t("title")}
        columns={columns}
        empty={<EmptyState body={assetId === null ? t("list.emptyBody") : common("states.noMatchesBody")} icon={<Fuel className="size-8" />} title={assetId === null ? t("list.emptyTitle") : common("states.noMatches")} />}
        error={list.error}
        hasPrevious={filters.cursor.length > 0}
        isLoading={list.isLoading}
        nextCursor={list.data?.nextCursor ?? null}
        onFirst={() => setFilters({ cursor: null })}
        onNext={(cursor) => setFilters({ cursor })}
        onRetry={() => void list.refetch()}
        rowKey={(row) => row.id}
        rows={list.data?.items}
        toolbar={
          <div className="w-full max-w-xs">
            <Field label={t("list.assetFilter")}>{(p) => <EntityPicker {...p} entity="assets" onChange={(id) => setFilters({ assetId: id, cursor: null })} value={assetId} />}</Field>
          </div>
        }
      />
      {open ? <FuelLogDialog defaultAssetId={assetId} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function ConsumptionCard({ assetId }: { readonly assetId: string }) {
  const t = useTranslations("fuel");
  const locale = useLocale();
  const query = useQuery({ queryKey: ["fuel", "consumption", assetId], queryFn: () => api<FuelConsumptionDTO>("/fuel-logs/consumption", { query: { assetId } }) });
  return (
    <section aria-labelledby="fuel-consumption" className="rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4">
      <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold" id="fuel-consumption">
        <Gauge aria-hidden="true" className="size-5" />
        {t("consumption.title")}
      </h2>
      {query.isLoading ? (
        <p aria-live="polite">{t("consumption.loading")}</p>
      ) : query.error !== null || query.data === undefined ? (
        <ErrorAlert compact error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.averageLitersPerHour === null ? (
        <p>{t("consumption.none")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-2xl font-bold">
            {t("consumption.average")}: {t("consumption.perHour", { value: formatNumber(query.data.averageLitersPerHour, locale, 2) })}
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {query.data.points.slice(-5).map((point) => (
              <li key={point.toLogId}>
                {formatDateTime(point.at, locale)} — {t("consumption.interval", { liters: formatNumber(point.liters, locale, 1), hours: formatNumber(point.hours, locale, 1) })} → {t("consumption.perHour", { value: formatNumber(point.litersPerHour, locale, 2) })}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Office entry; the client id stays the same across retries so a repeated save never doubles a fill-up. */
export function FuelLogDialog({ defaultAssetId, onClose }: { readonly defaultAssetId: string | null; readonly onClose: () => void }) {
  const t = useTranslations("fuel");
  const common = useTranslations("common");
  const locale = useLocale();
  const client = useQueryClient();
  const fieldErrorsOf = useFieldErrors();
  const id = useRef(crypto.randomUUID());
  const [values, setValues] = useState<FuelFormValues>({ ...EMPTY_FUEL_FORM, assetId: defaultAssetId });
  const [local, setLocal] = useState<FuelFormErrors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const server = fieldErrorsOf(error);
  const set = (patch: Partial<FuelFormValues>) => setValues({ ...values, ...patch });
  const message = (key: keyof FuelFormErrors): string | undefined => (local[key] === undefined ? server[key] : t(`errors.${key}.${local[key]}`));
  const total = previewTotalCents(values);
  const submit = async () => {
    const found = validateFuelForm(values);
    setLocal(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    setError(null);
    try {
      await api<FuelLogDTO>("/fuel-logs", { method: "POST", body: fuelBody(values, id.current) });
      await client.invalidateQueries({ queryKey: ["fuel"] });
      toast.success(t("toast.saved"));
      onClose();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      closeLabel={common("actions.cancel")}
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose}>{common("actions.cancel")}</Button>
          <Button busy={busy} icon={<Fuel aria-hidden="true" className="size-4" />} onClick={() => void submit()} variant="primary">
            {t("actions.save")}
          </Button>
        </>
      }
      onClose={onClose}
      open
      size="lg"
      title={t("new.title")}
    >
      <div className="flex flex-col gap-4">
        {error === null || Object.keys(server).length > 0 ? null : <ErrorAlert error={error} onRetry={() => void submit()} />}
        <div className="grid gap-4 md:grid-cols-2">
          <Field error={message("assetId")} label={t("fields.asset")} required>
            {(p) => <EntityPicker {...p} entity="assets" onChange={(assetId) => set({ assetId })} value={values.assetId} />}
          </Field>
          <Field error={message("liters")} hint={t("new.litersHint")} label={t("fields.liters")} required>
            {(p) => <Input {...p} inputMode="decimal" onChange={(e) => set({ liters: e.target.value })} value={values.liters} />}
          </Field>
          <Field error={server.pricePerLiterCents} label={t("fields.pricePerLiter")}>
            {(p) => <MoneyInput {...p} cents={values.pricePerLiterCents} onChange={(pricePerLiterCents) => set({ pricePerLiterCents })} />}
          </Field>
          <div className="flex flex-col justify-end gap-1">
            <span className="text-sm font-semibold">{t("fields.total")}</span>
            <span aria-live="polite" className="text-lg font-bold">
              {total === null ? "—" : formatMoney(total, locale)}
            </span>
          </div>
          <Field error={message("hourMeter")} hint={t("new.readingsHint")} label={t("fields.hourMeter")}>
            {(p) => <Input {...p} inputMode="decimal" onChange={(e) => set({ hourMeter: e.target.value })} value={values.hourMeter} />}
          </Field>
          <Field error={message("odometerKm")} label={t("fields.odometerKm")}>
            {(p) => <Input {...p} inputMode="decimal" onChange={(e) => set({ odometerKm: e.target.value })} value={values.odometerKm} />}
          </Field>
          <Field error={server.siteId} label={t("fields.site")}>
            {(p) => <EntityPicker {...p} entity="sites" onChange={(siteId) => set({ siteId })} value={values.siteId} />}
          </Field>
          <Field error={server.filledAt} hint={t("new.filledAtHint")} label={t("fields.filledAt")}>
            {(p) => <Input {...p} onChange={(e) => set({ filledAt: e.target.value })} type="datetime-local" value={values.filledAt} />}
          </Field>
        </div>
        <Field error={server.notes} label={t("fields.notes")}>
          {(p) => <Textarea {...p} maxLength={500} onChange={(e) => set({ notes: e.target.value })} rows={2} value={values.notes} />}
        </Field>
      </div>
    </Dialog>
  );
}
