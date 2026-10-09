"use client";

import type { StockLocationType } from "@agrorende/contracts/enums";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRightLeft, Boxes, CheckCircle2, MinusCircle, Plus, Truck, Warehouse } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DataTable } from "@/components/data/DataTable";
import { Card } from "@/components/data/Detail";
import { EmptyState, QueryState } from "@/components/data/States";
import { EntityPicker } from "@/components/forms/EntityPicker";
import { FormDialog } from "@/components/forms/FormDialog";
import { MoneyInput } from "@/components/forms/MoneyInput";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/format";
import { useFieldErrors, type ListPage } from "@/lib/forms";
import { useSave } from "@/lib/useSave";

import {
  EMPTY_LOCATION_FORM,
  EMPTY_MOVEMENT_FORM,
  levelTone,
  locationBody,
  MANUAL_MOVEMENT_TYPES,
  movementBody,
  type LocationFormValues,
  type ManualMovementType,
  type MovementFormValues,
  type PartDTO,
  type StockLevelRow,
  type StockLocationRow,
  type StockMovementDTO,
} from "./types";

function LocationIcon({ type }: { readonly type: StockLocationType }) {
  return type === "VAN" ? <Truck aria-hidden="true" className="size-4" /> : <Warehouse aria-hidden="true" className="size-4" />;
}

function LevelBadge({ level }: { readonly level: StockLevelRow }) {
  const t = useTranslations("parts");
  const tone = levelTone(level);
  if (tone === "danger") return <Badge icon={<MinusCircle aria-hidden="true" className="size-4" />} tone="danger">{t("stock.negative")}</Badge>;
  if (tone === "warning") return <Badge icon={<AlertTriangle aria-hidden="true" className="size-4" />} tone="warning">{t("stock.low")}</Badge>;
  return <Badge icon={<CheckCircle2 aria-hidden="true" className="size-4" />} tone="success">{t("stock.ok")}</Badge>;
}

/** Office stock page (ERP-05): levels per location with the low-stock flag, locations and the movement ledger. */
export function StockPage() {
  const t = useTranslations("parts");
  const locale = useLocale();
  const [locationId, setLocationId] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [dialog, setDialog] = useState<"location" | "movement" | null>(null);
  const locations = useQuery({ queryKey: ["stock-locations"], queryFn: () => api<ListPage<StockLocationRow>>("/stock-locations") });
  const levels = useQuery({
    queryKey: ["stock-levels", { locationId, lowOnly }],
    queryFn: () => api<ListPage<StockLevelRow>>("/stock-levels", { query: { locationId: locationId.length > 0 ? locationId : undefined, low: lowOnly ? "true" : undefined } }),
  });
  const movements = useQuery({
    queryKey: ["stock-movements", { locationId }],
    queryFn: () => api<ListPage<StockMovementDTO>>("/stock-movements", { query: { locationId: locationId.length > 0 ? locationId : undefined, limit: 20 } }),
  });
  const locationItems = locations.data?.items ?? [];
  const locationName = (id: string | null) => (id === null ? "—" : (locationItems.find((l) => l.id === id)?.name ?? "—"));
  const partNames = new Map((levels.data?.items ?? []).map((l) => [l.partId, `${l.partSku} · ${l.partName}`]));

  const columns = useMemo<ColumnDef<StockLevelRow, unknown>[]>(
    () => [
      {
        header: t("fields.name"),
        id: "part",
        cell: (c) => (
          <span className="flex flex-col">
            <span className="font-semibold">{c.row.original.partName}</span>
            <span className="font-mono text-sm text-[var(--ar-text-muted)]">{c.row.original.partSku}</span>
          </span>
        ),
      },
      {
        header: t("fields.location"),
        id: "location",
        cell: (c) => (
          <span className="inline-flex items-center gap-2">
            <LocationIcon type={c.row.original.locationType} />
            {c.row.original.locationName}
          </span>
        ),
      },
      { header: t("fields.quantity"), accessorKey: "quantity", cell: (c) => <span className="font-semibold">{`${formatNumber(c.row.original.quantity, locale, 2)} ${c.row.original.unit}`}</span> },
      { header: t("fields.minStock"), accessorKey: "minStock", cell: (c) => (c.row.original.minStock === null ? "—" : formatNumber(c.row.original.minStock, locale, 2)) },
      { header: t("fields.status"), id: "status", cell: (c) => <LevelBadge level={c.row.original} /> },
    ],
    [t, locale],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <>
            <Button icon={<Plus aria-hidden="true" className="size-4" />} onClick={() => setDialog("location")}>
              {t("stock.newLocation")}
            </Button>
            <Button disabled={locationItems.length === 0} icon={<ArrowRightLeft aria-hidden="true" className="size-4" />} onClick={() => setDialog("movement")} variant="primary">
              {t("stock.newMovement")}
            </Button>
          </>
        }
        subtitle={t("stock.subtitle")}
        title={t("stock.title")}
      />
      <section aria-labelledby="stock-locations" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold" id="stock-locations">
          {t("stock.locationsTitle")}
        </h2>
        <QueryState
          empty={<EmptyState action={<Button onClick={() => setDialog("location")} variant="primary">{t("stock.newLocation")}</Button>} body={t("stock.noLocationsBody")} icon={<Warehouse className="size-8" />} title={t("stock.noLocationsTitle")} />}
          error={locations.error}
          isEmpty={locationItems.length === 0}
          isLoading={locations.isLoading}
          onRetry={() => void locations.refetch()}
        >
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {locationItems.map((l) => (
              <li key={l.id}>
                <Card title={l.name}>
                  <p className="inline-flex items-center gap-2 text-[var(--ar-text-muted)]">
                    <LocationIcon type={l.type} />
                    {t(`locationType.${l.type}`)}
                    {l.userName === null ? null : ` · ${l.userName}`}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        </QueryState>
      </section>
      <section aria-labelledby="stock-levels" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold" id="stock-levels">
          {t("stock.levelsTitle")}
        </h2>
        <DataTable
          caption={t("stock.levelsTitle")}
          columns={columns}
          empty={<EmptyState body={t("stock.emptyBody")} icon={<Boxes className="size-8" />} title={t("stock.emptyTitle")} />}
          error={levels.error}
          isLoading={levels.isLoading}
          onRetry={() => void levels.refetch()}
          rowKey={(row) => row.id}
          rows={levels.data?.items}
          toolbar={
            <>
              <div className="w-full max-w-xs">
                <Field label={t("fields.location")}>
                  {(p) => (
                    <Select {...p} onChange={(e) => setLocationId(e.target.value)} value={locationId}>
                      <option value="">{t("stock.allLocations")}</option>
                      {locationItems.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
              <Checkbox checked={lowOnly} label={t("stock.lowOnly")} onChange={(e) => setLowOnly(e.target.checked)} />
            </>
          }
        />
      </section>
      <section aria-labelledby="stock-movements" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold" id="stock-movements">
          {t("stock.movementsTitle")}
        </h2>
        <QueryState empty={<p className="text-[var(--ar-text-muted)]">{t("stock.noMovements")}</p>} error={movements.error} isEmpty={(movements.data?.items.length ?? 0) === 0} isLoading={movements.isLoading} onRetry={() => void movements.refetch()}>
          <ul className="flex flex-col divide-y divide-[var(--ar-border)] rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)]">
            {(movements.data?.items ?? []).map((m) => (
              <li className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3" key={m.id}>
                <Badge tone={m.type === "OUT_TO_WORK_ORDER" ? "info" : "neutral"}>{t(`movementType.${m.type}`)}</Badge>
                <span className="font-semibold">{partNames.get(m.partId) ?? m.partId.slice(0, 8)}</span>
                <span>{formatNumber(m.quantity, locale, 2)}</span>
                <span className="text-[var(--ar-text-muted)]">
                  {m.fromLocationId === null ? "" : `${locationName(m.fromLocationId)} → `}
                  {locationName(m.toLocationId)}
                </span>
                <span className="ml-auto text-sm text-[var(--ar-text-muted)]">{formatDateTime(m.createdAt, locale)}</span>
                {m.note === null || m.note.length === 0 ? null : <span className="w-full text-sm">{m.note}</span>}
              </li>
            ))}
          </ul>
        </QueryState>
      </section>
      {dialog === "location" ? <LocationDialog onClose={() => setDialog(null)} /> : null}
      {dialog === "movement" ? <MovementDialog locations={locationItems} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}

function LocationDialog({ onClose }: { readonly onClose: () => void }) {
  const t = useTranslations("parts");
  const [values, setValues] = useState<LocationFormValues>(EMPTY_LOCATION_FORM);
  const [save, state] = useSave("stock-locations", (body: Record<string, unknown>) => api<StockLocationRow>("/stock-locations", { method: "POST", body }), () => {
    toast.success(t("stock.locationToast"));
    onClose();
  });
  const fe = useFieldErrors()(state.error);
  return (
    <FormDialog busy={state.busy} dirty={values.name.length > 0} error={state.error} formId="stock-location-form" onClose={onClose} onSubmit={() => void save(locationBody(values))} open title={t("stock.locationTitle")}>
      <Field error={fe.name} label={t("fields.name")} required>
        {(p) => <Input {...p} onChange={(e) => setValues({ ...values, name: e.target.value })} value={values.name} />}
      </Field>
      <Field error={fe.type} label={t("fields.locationType")} required>
        {(p) => (
          <Select {...p} onChange={(e) => setValues({ ...values, type: e.target.value as StockLocationType })} value={values.type}>
            <option value="WAREHOUSE">{t("locationType.WAREHOUSE")}</option>
            <option value="VAN">{t("locationType.VAN")}</option>
          </Select>
        )}
      </Field>
      {values.type === "VAN" ? (
        <Field error={fe.userId} hint={t("stock.vanHint")} label={t("fields.technician")} required>
          {(p) => <EntityPicker {...p} entity="users" filters={{ role: "FIELD" }} onChange={(id) => setValues({ ...values, userId: id })} value={values.userId} />}
        </Field>
      ) : null}
    </FormDialog>
  );
}

function MovementDialog({ locations, onClose }: { readonly locations: readonly StockLocationRow[]; readonly onClose: () => void }) {
  const t = useTranslations("parts");
  const client = useQueryClient();
  const parts = useQuery({ queryKey: ["parts", { picker: true }], queryFn: () => api<ListPage<PartDTO>>("/parts") });
  const [values, setValues] = useState<MovementFormValues>(EMPTY_MOVEMENT_FORM);
  const [save, state] = useSave("stock-levels", (body: Record<string, unknown>) => api<StockMovementDTO>("/stock-movements", { method: "POST", body }), () => {
    void client.invalidateQueries({ queryKey: ["stock-movements"] });
    toast.success(t("stock.movementToast"));
    onClose();
  });
  const fe = useFieldErrors()(state.error);
  const set = <K extends keyof MovementFormValues>(key: K, value: MovementFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  const locationSelect = (key: "fromLocationId" | "toLocationId", label: string) => (
    <Field error={fe[key]} label={label} required>
      {(p) => (
        <Select {...p} onChange={(e) => set(key, e.target.value)} value={values[key]}>
          <option value="">—</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {`${l.name} · ${t(`locationType.${l.type}`)}`}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
  return (
    <FormDialog busy={state.busy} dirty={values.partId.length > 0 || values.quantity.length > 0} error={state.error} formId="stock-movement-form" onClose={onClose} onSubmit={() => void save(movementBody(values))} open title={t("stock.movementTitle")}>
      <Field error={fe.type} hint={t(`movementHint.${values.type}`)} label={t("fields.movementType")} required>
        {(p) => (
          <Select {...p} onChange={(e) => set("type", e.target.value as ManualMovementType)} value={values.type}>
            {MANUAL_MOVEMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`movementType.${type}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field error={fe.partId} label={t("fields.name")} required>
        {(p) => (
          <Select {...p} onChange={(e) => set("partId", e.target.value)} value={values.partId}>
            <option value="">—</option>
            {(parts.data?.items ?? []).map((part) => (
              <option key={part.id} value={part.id}>
                {`${part.sku} · ${part.name}`}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {values.type === "TRANSFER" ? locationSelect("fromLocationId", t("fields.from")) : null}
      {locationSelect("toLocationId", values.type === "TRANSFER" ? t("fields.to") : t("fields.location"))}
      <Field error={fe.quantity} label={t("fields.quantity")} required>
        {(p) => <Input {...p} inputMode="decimal" onChange={(e) => set("quantity", e.target.value)} value={values.quantity} />}
      </Field>
      {values.type === "IN" ? (
        <Field error={fe.unitCostCents} label={t("fields.unitCost")}>
          {(p) => <MoneyInput {...p} cents={values.unitCostCents} onChange={(cents) => set("unitCostCents", cents)} />}
        </Field>
      ) : null}
      <Field error={fe.note} label={t("fields.note")}>
        {(p) => <Textarea {...p} onChange={(e) => set("note", e.target.value)} value={values.note} />}
      </Field>
    </FormDialog>
  );
}
