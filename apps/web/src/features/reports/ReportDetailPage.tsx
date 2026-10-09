"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertOctagon, AlertTriangle, Eye, Link2, PlayCircle, Tractor, Wrench, XCircle } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { PriorityBadge, StatusBadge } from "@/components/data/badges";
import { Detail } from "@/components/data/Detail";
import { EntityTimeline } from "@/components/data/EntityTimeline";
import { LoadingState } from "@/components/data/States";
import { ConfirmDialog } from "@/components/forms/ConfirmDialog";
import { MapView } from "@/components/map/MapView";
import { MediaGallery } from "@/components/media/MediaGallery";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button, buttonVariants } from "@/components/ui/Button";
import { api, isApiError } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/format";
import { useSave } from "@/lib/useSave";

import { LinkAssetDialog } from "./LinkAssetDialog";
import { MarkForRepairDialog } from "./MarkForRepairDialog";
import { reportFlagKeys, type FieldReportDetail } from "./types";

type Dialog = "monitor" | "dismiss" | "repair" | "link" | null;

const OFFICE_OPEN = new Set(["SUBMITTED", "IN_REVIEW", "MONITORING"]);

/** Report detail for office triage: evidence, place, history and the four decisions (F1). */
export function ReportDetailPage({ id }: { readonly id: string }) {
  const t = useTranslations("reports");
  const common = useTranslations("common");
  const locale = useLocale();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["field-reports", id], queryFn: () => api<FieldReportDetail>(`/field-reports/${id}`) });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [startReview, reviewState] = useSave("field-reports", () => api<unknown>(`/field-reports/${id}/start-review`, { method: "POST", body: {} }), () => toast.success(t("toast.reviewStarted")));

  if (query.isLoading) return <LoadingState />;
  if (query.error !== null || query.data === undefined) return <ErrorAlert error={query.error} onRetry={() => void query.refetch()} />;
  const report = query.data;
  const open = OFFICE_OPEN.has(report.status);
  const refresh = () => client.invalidateQueries({ queryKey: ["field-reports"] });
  const lockedError = isApiError(reviewState.error, "REPORT_LOCKED");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          open ? (
            <>
              {report.status === "SUBMITTED" ? (
                <Button busy={reviewState.busy} icon={<PlayCircle aria-hidden="true" className="size-4" />} onClick={() => void startReview()}>
                  {t("actions.startReview")}
                </Button>
              ) : null}
              <Button icon={<Wrench aria-hidden="true" className="size-4" />} onClick={() => setDialog("repair")} variant="primary">
                {t("actions.markForRepair")}
              </Button>
              {report.status === "MONITORING" ? null : (
                <Button icon={<Eye aria-hidden="true" className="size-4" />} onClick={() => setDialog("monitor")}>
                  {t("actions.monitor")}
                </Button>
              )}
              <Button icon={<XCircle aria-hidden="true" className="size-4" />} onClick={() => setDialog("dismiss")} variant="danger">
                {t("actions.dismiss")}
              </Button>
            </>
          ) : report.workOrder === null ? undefined : (
            <Link className={buttonVariants({ variant: "primary" })} href={`/work-orders/${report.workOrder.id}`}>
              <Wrench aria-hidden="true" className="size-4" />
              {t("actions.openWorkOrder", { number: report.workOrder.number })}
            </Link>
          )
        }
        back={{ href: "/reports", label: t("inbox.title") }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{report.number ?? "—"}</span>
            <StatusBadge kind="report" status={report.status} />
            <PriorityBadge priority={report.priority} />
            {report.machineOperable ? null : (
              <span className="inline-flex items-center gap-1 font-semibold text-[var(--ar-danger)]">
                <AlertOctagon aria-hidden="true" className="size-4" />
                {t("notOperable")}
              </span>
            )}
          </span>
        }
        title={report.title}
      />
      {reviewState.error === null ? null : lockedError ? (
        <div className="flex items-start gap-2 rounded-cards border-2 border-[var(--ar-warning)] p-4" role="alert">
          <AlertTriangle aria-hidden="true" className="mt-1 size-5" />
          <div>
            <p className="font-semibold">{t("recovery.locked.title")}</p>
            <p>{t("recovery.locked.body")}</p>
          </div>
        </div>
      ) : (
        <ErrorAlert error={reviewState.error} onRetry={() => void query.refetch()} />
      )}
      <ReportFlags report={report} />
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4 lg:col-span-2">
          <h2 className="mb-3 text-lg font-semibold">{t("detail.summary")}</h2>
          <dl className="grid gap-4 sm:grid-cols-3">
            <Detail
              label={t("fields.asset")}
              value={
                report.asset === null ? (
                  <span className="flex flex-col items-start gap-2">
                    {t("unregistered", { description: report.unregisteredAssetDesc ?? "—" })}
                    <Button icon={<Link2 aria-hidden="true" className="size-4" />} onClick={() => setDialog("link")}>
                      {t("actions.linkAsset")}
                    </Button>
                  </span>
                ) : (
                  <Link className="inline-flex items-center gap-1 font-semibold text-[var(--ar-link)]" href={`/assets/${report.asset.id}`}>
                    <Tractor aria-hidden="true" className="size-4" />
                    {report.asset.code} · {report.asset.name}
                  </Link>
                )
              }
            />
            <Detail label={t("fields.category")} value={t(`category.${report.category}`)} />
            <Detail label={t("fields.suggestedAction")} value={t(`suggestedAction.${report.suggestedAction}`)} />
            <Detail label={t("fields.machineOperable")} value={report.machineOperable ? t("operable.yes") : t("operable.no")} />
            <Detail label={t("fields.reporter")} value={report.reporter === null ? null : `${report.reporter.name}${report.reporter.phone === null ? "" : ` · ${report.reporter.phone}`}`} />
            <Detail label={t("fields.site")} value={report.site === null ? null : `${report.site.name}${report.plot === null ? "" : ` · ${report.plot.name}`}`} />
            <Detail label={t("fields.occurredAt")} value={formatDateTime(report.occurredAt, locale)} />
            <Detail label={t("fields.receivedAt")} value={formatDateTime(report.receivedAt, locale)} />
            <Detail label={t("fields.rental")} value={report.rental === null ? null : <Link className="font-semibold text-[var(--ar-link)]" href={`/rentals/${report.rental.id}`}>{report.rental.number}</Link>} />
            <Detail label={t("fields.workOrder")} value={report.workOrder === null ? null : <Link className="font-semibold text-[var(--ar-link)]" href={`/work-orders/${report.workOrder.id}`}>{report.workOrder.number}</Link>} />
          </dl>
          <h3 className="mb-1 mt-4 font-semibold">{t("detail.description")}</h3>
          <p className="whitespace-pre-wrap">{report.description ?? t("detail.noDescription")}</p>
          {report.statusReason === null || report.statusReason === undefined ? null : <p className="mt-3 whitespace-pre-wrap rounded-controls bg-[var(--ar-surface-muted)] p-3">{report.statusReason}</p>}
        </section>
        <section className="flex flex-col gap-3 rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4">
          <h2 className="text-lg font-semibold">{t("detail.location")}</h2>
          {report.lat === null || report.lat === undefined || report.lng === null || report.lng === undefined ? (
            <p className="text-sm">{t("detail.noLocation")}</p>
          ) : (
            <>
              <MapView className="h-56 overflow-hidden rounded-cards border border-[var(--ar-border)]" mapId={`report-${id}`} points={[{ id, lat: report.lat, lng: report.lng, label: report.title, shape: "circle", tone: report.priority === "CRITICAL" ? "danger" : "primary" }]} />
              {report.accuracyM === null || report.accuracyM === undefined ? null : <p className="text-sm text-[var(--ar-text-muted)]">{t("detail.accuracy", { meters: formatNumber(report.accuracyM, locale) })}</p>}
            </>
          )}
        </section>
      </div>
      <section className="rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4">
        <h2 className="mb-3 text-lg font-semibold">{t("detail.media")}</h2>
        <MediaGallery items={report.media.map((m) => ({ id: m.id, kind: m.kind, status: m.status, caption: m.caption ?? null }))} />
      </section>
      <section className="rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4">
        <h2 className="mb-3 text-lg font-semibold">{t("detail.activity")}</h2>
        <EntityTimeline
          entries={[...report.activity]
            .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
            .map((a) => ({
              id: a.id,
              action: t.has(`activity.${a.action}`) ? t(`activity.${a.action}`) : a.action,
              createdAt: a.occurredAt,
              summary: a.toStatus === null || a.toStatus === undefined ? null : `${a.fromStatus === null || a.fromStatus === undefined ? "—" : common(`status.report.${a.fromStatus}`)} → ${common(`status.report.${a.toStatus}`)}`,
            }))}
        />
      </section>
      {dialog === "link" ? (
        <LinkAssetDialog
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            toast.success(t("toast.assetLinked"));
            void refresh();
          }}
          report={report}
        />
      ) : null}
      {dialog === "repair" ? (
        <MarkForRepairDialog
          onClose={() => setDialog(null)}
          onDone={(result) => {
            setDialog(null);
            toast.success(result.attached ? t("toast.attached", { number: result.workOrderNumber }) : t("toast.markedForRepair", { number: result.workOrderNumber }));
            void refresh();
          }}
          open
          report={report}
        />
      ) : null}
      <ConfirmDialog
        body={t("dialogs.monitor.body")}
        confirmLabel={t("actions.monitor")}
        onClose={() => setDialog(null)}
        onConfirm={async (note) => {
          await api(`/field-reports/${id}/monitor`, { method: "POST", body: { note } });
          await refresh();
          toast.success(t("toast.monitoring"));
        }}
        open={dialog === "monitor"}
        reasonLabel={t("dialogs.monitor.note")}
        title={t("dialogs.monitor.title")}
        tone="primary"
      />
      <ConfirmDialog
        body={t("dialogs.dismiss.body")}
        confirmLabel={t("actions.dismiss")}
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => {
          await api(`/field-reports/${id}/dismiss`, { method: "POST", body: { reason } });
          await refresh();
          toast.success(t("toast.dismissed"));
        }}
        open={dialog === "dismiss"}
        reasonLabel={t("dialogs.dismiss.reason")}
        title={t("dialogs.dismiss.title")}
      />
    </div>
  );
}

function ReportFlags({ report }: { readonly report: FieldReportDetail }) {
  const t = useTranslations("reports");
  const keys = reportFlagKeys(report.flags, report.damageId);
  if (keys.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {keys.map((key) => (
        <li className={`flex items-start gap-2 rounded-cards border p-3 ${key === "busyAsset" ? "border-2 border-[var(--ar-danger)]" : "border-[var(--ar-warning)]"}`} key={key}>
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <span>{t(`flags.${key}`)}</span>
        </li>
      ))}
    </ul>
  );
}
