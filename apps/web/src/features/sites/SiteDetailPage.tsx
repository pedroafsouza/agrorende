"use client";

import type { PlotDTO, SiteDTO } from "@agrorende/contracts/dto";
import { useQuery } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Card, Detail } from "@/components/data/Detail";
import { LoadingState } from "@/components/data/States";
import { ConfirmDialog } from "@/components/forms/ConfirmDialog";
import { FormDialog } from "@/components/forms/FormDialog";
import { MapView, type MapPoint } from "@/components/map/MapView";
import { ConflictActions } from "@/components/recovery/ConflictActions";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { api, isApiError } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { nullIfEmpty, numberOrNull, useFieldErrors, type ListPage } from "@/lib/forms";
import { useSave } from "@/lib/useSave";

import { SiteFields, siteBody, siteFormValues } from "./SiteForm";

interface PlotValues {
  name: string;
  code: string;
  crop: string;
  areaHa: string;
  centroidLat: string;
  centroidLng: string;
}

const plotValues = (plot?: PlotDTO): PlotValues => {
  const num = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
  return { name: plot?.name ?? "", code: plot?.code ?? "", crop: plot?.crop ?? "", areaHa: num(plot?.areaHa), centroidLat: num(plot?.centroidLat), centroidLng: num(plot?.centroidLng) };
};

const plotBody = (v: PlotValues) => ({
  name: v.name.trim(),
  code: nullIfEmpty(v.code),
  crop: nullIfEmpty(v.crop),
  areaHa: numberOrNull(v.areaHa),
  centroidLat: numberOrNull(v.centroidLat),
  centroidLng: numberOrNull(v.centroidLng),
});

function PlotFields({ values, onChange, error }: { readonly values: PlotValues; readonly onChange: (v: PlotValues) => void; readonly error: unknown }) {
  const t = useTranslations("assets");
  const fe = useFieldErrors()(error);
  const field = (key: keyof PlotValues, numeric = false, required = false) => (
    <Field error={fe[key] ?? (key === "centroidLat" || key === "centroidLng" ? fe.boundary : undefined)} label={t(`plots.fields.${key}`)} required={required}>
      {(p) => <Input {...p} inputMode={numeric ? "decimal" : undefined} name={key} onChange={(e) => onChange({ ...values, [key]: e.target.value })} value={values[key]} />}
    </Field>
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {field("name", false, true)}
      {field("code")}
      {field("crop")}
      {field("areaHa", true)}
      {field("centroidLat", true)}
      {field("centroidLng", true)}
    </div>
  );
}

export function SiteDetailPage({ id }: { readonly id: string }) {
  const t = useTranslations("assets");
  const common = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const site = useQuery({ queryKey: ["sites", id], queryFn: () => api<SiteDTO>(`/sites/${id}`) });
  const plots = useQuery({ queryKey: ["plots", id], queryFn: () => api<ListPage<PlotDTO>>(`/sites/${id}/plots`) });
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(siteFormValues());
  const [deleting, setDeleting] = useState(false);
  const [plotOpen, setPlotOpen] = useState<PlotDTO | "new" | null>(null);
  const [plot, setPlot] = useState(plotValues());
  const [saveSite, siteState] = useSave("sites", (body: Record<string, unknown>, version: string) => api<SiteDTO>(`/sites/${id}`, { method: "PATCH", body, version }), () => {
    setEditing(false);
    toast.success(common("toast.saved"));
  });
  const [archive, archiveState] = useSave("sites", (archived: boolean, version: string) => api<SiteDTO>(`/sites/${id}`, { method: "PATCH", body: { archived }, version }), () => toast.success(common("toast.saved")));
  const [savePlot, plotState] = useSave(
    "plots",
    (input: { body: Record<string, unknown>; target: PlotDTO | "new" }) =>
      input.target === "new" ? api<PlotDTO>(`/sites/${id}/plots`, { method: "POST", body: input.body }) : api<PlotDTO>(`/plots/${input.target.id}`, { method: "PATCH", body: input.body, version: input.target.syncVersion }),
    () => {
      setPlotOpen(null);
      toast.success(common("toast.saved"));
    },
  );

  if (site.isLoading) return <LoadingState />;
  if (site.error !== null || site.data === undefined) return <ErrorAlert error={site.error} onRetry={() => void site.refetch()} />;
  const s = site.data;
  const archived = s.archivedAt !== null && s.archivedAt !== undefined;
  const points: MapPoint[] = [];
  if (s.lat !== null && s.lat !== undefined && s.lng !== null && s.lng !== undefined) points.push({ id: s.id, lat: s.lat, lng: s.lng, label: s.name, shape: "square" });
  for (const p of plots.data?.items ?? []) {
    if (p.centroidLat !== null && p.centroidLat !== undefined && p.centroidLng !== null && p.centroidLng !== undefined) points.push({ id: p.id, lat: p.centroidLat, lng: p.centroidLng, label: p.name, tone: "warning" });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <>
            <Button icon={<Pencil aria-hidden="true" className="size-4" />} onClick={() => { setValues(siteFormValues(s)); siteState.reset(); setEditing(true); }}>
              {common("actions.edit")}
            </Button>
            <Button busy={archiveState.busy} icon={archived ? <ArchiveRestore aria-hidden="true" className="size-4" /> : <Archive aria-hidden="true" className="size-4" />} onClick={() => void archive(!archived, s.syncVersion)}>
              {archived ? common("actions.unarchive") : common("actions.archive")}
            </Button>
            <Button icon={<Trash2 aria-hidden="true" className="size-4" />} onClick={() => setDeleting(true)} variant="danger">
              {common("actions.delete")}
            </Button>
          </>
        }
        back={{ href: "/sites", label: t("sites.list.title") }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {t(`sites.type.${s.type}`)}
            {archived ? <Badge tone="neutral">{common("states.archived")}</Badge> : null}
          </span>
        }
        title={s.name}
      />
      {archiveState.error === null ? null : <ErrorAlert error={archiveState.error} onRetry={() => void site.refetch()} />}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t("detail.info")}>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail label={t("sites.fields.address")} value={s.address} />
            <Detail label={t("sites.fields.city")} value={[s.city, s.state].filter(Boolean).join(" · ")} />
            <Detail label={t("sites.fields.radiusM")} value={formatNumber(s.radiusM, locale, 0)} />
            <Detail label={t("sites.fields.coordinates")} value={s.lat === null || s.lat === undefined ? null : `${formatNumber(s.lat, locale, 5)}, ${formatNumber(s.lng ?? null, locale, 5)}`} />
          </dl>
          {s.notes === null || s.notes === undefined ? null : <p className="mt-4 whitespace-pre-wrap">{s.notes}</p>}
        </Card>
        <Card title={t("sites.detail.map")}>
          {points.length === 0 ? <p>{t("detail.noLocation")}</p> : <MapView className="h-64 overflow-hidden rounded-cards border border-[var(--ar-border)]" mapId={`site-${id}`} points={points} />}
        </Card>
      </div>
      <Card
        actions={<Button icon={<Plus aria-hidden="true" className="size-4" />} onClick={() => { setPlot(plotValues()); plotState.reset(); setPlotOpen("new"); }}>{t("plots.actions.new")}</Button>}
        title={t("plots.title")}
      >
        {plots.error === null ? null : <ErrorAlert compact error={plots.error} onRetry={() => void plots.refetch()} />}
        {plots.isLoading ? <LoadingState /> : null}
        {plots.data !== undefined && plots.data.items.length === 0 ? <p className="text-[var(--ar-text-muted)]">{t("plots.empty")}</p> : null}
        <ul className="divide-y divide-[var(--ar-border)]">
          {(plots.data?.items ?? []).map((p) => (
            <li className="flex min-h-14 flex-wrap items-center gap-3 py-2" key={p.id}>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{p.name}</p>
                <p className="text-sm text-[var(--ar-text-muted)]">{[p.code, p.crop, p.areaHa === null || p.areaHa === undefined ? null : `${formatNumber(p.areaHa, locale, 2)} ha`].filter(Boolean).join(" · ")}</p>
              </div>
              <Button icon={<Pencil aria-hidden="true" className="size-4" />} onClick={() => { setPlot(plotValues(p)); plotState.reset(); setPlotOpen(p); }} variant="ghost">
                {common("actions.edit")}
              </Button>
            </li>
          ))}
        </ul>
      </Card>
      <FormDialog
        busy={siteState.busy}
        dirty
        error={siteState.error}
        errorAction={siteState.conflict ? <ConflictActions onKeepMine={() => void site.refetch().then((r) => r.data === undefined ? undefined : saveSite(siteBody(values), r.data.syncVersion))} onUseTheirs={() => { setEditing(false); void site.refetch(); }} /> : undefined}
        formId="site-edit"
        onClose={() => setEditing(false)}
        onSubmit={() => void saveSite(siteBody(values), s.syncVersion)}
        open={editing}
        size="lg"
        title={t("sites.edit.title")}
      >
        <SiteFields error={siteState.error} onChange={setValues} values={values} />
      </FormDialog>
      <FormDialog busy={plotState.busy} dirty error={plotState.error} formId="plot-form" onClose={() => setPlotOpen(null)} onSubmit={() => plotOpen === null ? undefined : void savePlot({ body: plotBody(plot), target: plotOpen })} open={plotOpen !== null} title={plotOpen === "new" ? t("plots.actions.new") : t("plots.edit")}>
        <PlotFields error={plotState.error} onChange={setPlot} values={plot} />
      </FormDialog>
      <ConfirmDialog
        body={t("sites.delete.body")}
        confirmLabel={common("actions.delete")}
        errorAction={(error) =>
          isApiError(error) && error.code === "RECORD_IN_USE" && !archived ? (
            <Button onClick={() => { setDeleting(false); void archive(true, s.syncVersion); }}>{t("sites.delete.archiveInstead")}</Button>
          ) : null
        }
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          await api(`/sites/${id}`, { method: "DELETE" });
          toast.success(common("toast.deleted"));
          router.push("/sites");
        }}
        open={deleting}
        title={t("sites.delete.title", { name: s.name })}
      />
    </div>
  );
}
