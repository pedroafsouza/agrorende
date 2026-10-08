"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Ban, CheckCircle2, Pencil, QrCode } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { ConditionBadge } from "@/components/data/badges";
import { Detail } from "@/components/data/Detail";
import { EntityTimeline } from "@/components/data/EntityTimeline";
import { LoadingState } from "@/components/data/States";
import { ConfirmDialog } from "@/components/forms/ConfirmDialog";
import { FormDialog } from "@/components/forms/FormDialog";
import { MapView } from "@/components/map/MapView";
import { ConflictActions } from "@/components/recovery/ConflictActions";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import type { ListPage } from "@/lib/forms";
import { useSave } from "@/lib/useSave";

import { AssetFields, assetBody, assetFormValues, type AssetFormValues } from "./AssetForm";
import type { AssetDTO, AssetHistoryEntry } from "./types";

export function AssetDetailPage({ id }: { readonly id: string }) {
  const t = useTranslations("assets");
  const common = useTranslations("common");
  const locale = useLocale();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["assets", id], queryFn: () => api<AssetDTO>(`/assets/${id}`) });
  const history = useQuery({ queryKey: ["assets", id, "history"], queryFn: () => api<ListPage<AssetHistoryEntry>>(`/assets/${id}/history`, { query: { limit: 50 } }) });
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<AssetFormValues>(assetFormValues());
  const [retiring, setRetiring] = useState(false);
  const [save, saveState] = useSave("assets", (body: Record<string, unknown>, version: string) => api<AssetDTO>(`/assets/${id}`, { method: "PATCH", body, version }), () => {
    setEditing(false);
    toast.success(common("toast.saved"));
  });
  const [setCondition, conditionState] = useSave("assets", (condition: "OUT_OF_SERVICE" | "OPERATIONAL", version: string) => api<AssetDTO>(`/assets/${id}`, { method: "PATCH", body: { condition }, version }));

  if (query.isLoading) return <LoadingState />;
  if (query.error !== null || query.data === undefined) return <ErrorAlert error={query.error} onRetry={() => void query.refetch()} />;
  const asset = query.data;
  const retired = asset.condition === "RETIRED";

  const keepMine = async () => {
    const latest = await api<AssetDTO>(`/assets/${id}`);
    client.setQueryData(["assets", id], latest);
    void save(assetBody(values, "edit"), latest.syncVersion);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          retired ? undefined : (
            <>
              <Button
                icon={<Pencil aria-hidden="true" className="size-4" />}
                onClick={() => {
                  setValues(assetFormValues(asset));
                  saveState.reset();
                  setEditing(true);
                }}
              >
                {common("actions.edit")}
              </Button>
              {asset.condition === "OUT_OF_SERVICE" ? (
                <Button busy={conditionState.busy} icon={<CheckCircle2 aria-hidden="true" className="size-4" />} onClick={() => void setCondition("OPERATIONAL", asset.syncVersion)}>
                  {t("actions.backInService")}
                </Button>
              ) : (
                <Button busy={conditionState.busy} icon={<Ban aria-hidden="true" className="size-4" />} onClick={() => void setCondition("OUT_OF_SERVICE", asset.syncVersion)}>
                  {t("actions.outOfService")}
                </Button>
              )}
              <Button icon={<Archive aria-hidden="true" className="size-4" />} onClick={() => setRetiring(true)} variant="danger">
                {t("actions.retire")}
              </Button>
            </>
          )
        }
        back={{ href: "/assets", label: t("list.title") }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{asset.code}</span>
            <ConditionBadge condition={asset.condition} />
          </span>
        }
        title={asset.name}
      />
      {conditionState.error === null ? null : <ErrorAlert error={conditionState.error} onRetry={() => void query.refetch()} />}
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4 lg:col-span-2">
          <h2 className="mb-3 text-lg font-semibold">{t("detail.info")}</h2>
          <dl className="grid gap-4 sm:grid-cols-3">
            <Detail label={t("fields.category")} value={common(`category.${asset.category}`)} />
            <Detail label={t("fields.make")} value={asset.make} />
            <Detail label={t("fields.model")} value={asset.model} />
            <Detail label={t("fields.year")} value={asset.year === null || asset.year === undefined ? null : String(asset.year)} />
            <Detail label={t("fields.serialNumber")} value={asset.serialNumber} />
            <Detail label={t("fields.plate")} value={asset.plate} />
            <Detail label={t("fields.hourMeter")} value={formatNumber(asset.hourMeter, locale, 1)} />
            <Detail label={t("fields.odometerKm")} value={formatNumber(asset.odometerKm, locale, 0)} />
            <Detail label={t("fields.ownerType")} value={t(`ownerType.${asset.ownerType}`)} />
            <Detail label={t("fields.isRentable")} value={asset.isRentable ? common("yes") : common("no")} />
            <Detail label={t("fields.defaultRate")} value={asset.isRentable ? `${formatMoney(asset.defaultRateCents, locale)}${asset.defaultRateUnit === null || asset.defaultRateUnit === undefined ? "" : ` / ${common(`rateUnit.${asset.defaultRateUnit}`)}`}` : null} />
            <Detail label={t("fields.lastLocated")} value={formatDateTime(asset.lastLocatedAt, locale)} />
          </dl>
          {asset.notes === null || asset.notes === undefined ? null : <p className="mt-4 whitespace-pre-wrap">{asset.notes}</p>}
        </section>
        <section className="flex flex-col gap-3 rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4">
          <h2 className="text-lg font-semibold">{t("detail.qr")}</h2>
          <p className="text-sm text-[var(--ar-text-muted)]">{t("detail.qrBody")}</p>
          <a className="inline-flex min-h-12 items-center gap-2 font-semibold text-[var(--ar-link)]" download href={`/api/v1/assets/${id}/qr.png`}>
            <QrCode aria-hidden="true" className="size-5" />
            {t("actions.downloadQr")}
          </a>
          {asset.lastLat === null || asset.lastLat === undefined || asset.lastLng === null || asset.lastLng === undefined ? (
            <p className="text-sm">{t("detail.noLocation")}</p>
          ) : (
            <MapView className="h-56 overflow-hidden rounded-cards border border-[var(--ar-border)]" mapId={`asset-${id}`} points={[{ id, lat: asset.lastLat, lng: asset.lastLng, label: asset.name, shape: "diamond" }]} />
          )}
        </section>
      </div>
      <section className="rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4">
        <h2 className="mb-3 text-lg font-semibold">{t("detail.history")}</h2>
        {history.error === null ? (
          <EntityTimeline entries={(history.data?.items ?? []).map((h) => ({ id: h.id, action: h.action, createdAt: h.occurredAt, summary: h.toStatus === null ? null : `${h.fromStatus ?? "—"} → ${h.toStatus}` }))} />
        ) : (
          <ErrorAlert compact error={history.error} onRetry={() => void history.refetch()} />
        )}
      </section>
      <FormDialog
        busy={saveState.busy}
        dirty
        error={saveState.error}
        errorAction={saveState.conflict ? <ConflictActions onKeepMine={() => void keepMine()} onUseTheirs={() => { setEditing(false); void query.refetch(); }} /> : undefined}
        formId="asset-edit"
        onClose={() => setEditing(false)}
        onSubmit={() => void save(assetBody(values, "edit"), asset.syncVersion)}
        open={editing}
        size="lg"
        title={t("edit.title")}
      >
        <AssetFields error={saveState.error} mode="edit" onChange={setValues} values={values} />
      </FormDialog>
      <ConfirmDialog
        body={t("retire.body")}
        confirmLabel={t("actions.retire")}
        onClose={() => setRetiring(false)}
        onConfirm={async (reason) => {
          await api(`/assets/${id}/retire`, { method: "POST", body: { reason }, version: asset.syncVersion });
          await client.invalidateQueries({ queryKey: ["assets"] });
          toast.success(t("retire.done"));
        }}
        open={retiring}
        reasonLabel={t("retire.reason")}
        title={t("retire.title", { name: asset.name })}
      />
    </div>
  );
}
