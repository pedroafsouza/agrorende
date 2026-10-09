"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Ban, CheckCircle2, FileDown, ImageOff, PauseCircle, PlayCircle, Receipt, RotateCcw, ShieldAlert, Tractor, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState, type ReactElement } from "react";
import { toast } from "sonner";

import { PriorityBadge, StatusBadge } from "@/components/data/badges";
import { Detail } from "@/components/data/Detail";
import { EntityTimeline } from "@/components/data/EntityTimeline";
import { LoadingState } from "@/components/data/States";
import { ConfirmDialog } from "@/components/forms/ConfirmDialog";
import { MediaGallery, type GalleryItem } from "@/components/media/MediaGallery";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button, buttonVariants } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";

import { AssignDialog } from "./AssignDialog";
import { ExternalCostDialog, ExternalCostPanel, PartsPanel } from "./parts";
import { LateEvidenceBadge, SlaBadge } from "./badges";
import { officeActions, splitMinutes, type OfficeAction, type WorkOrderDetail, type WorkOrderListItem, type WorkOrderMediaItem } from "./types";

type DialogKey = Exclude<OfficeAction, never> | null;

/** Work-order detail for the office (WO-22..24): evidence, checklist, parts, times, costs, signature, history and actions. */
export function WorkOrderDetailPage({ id }: { readonly id: string }) {
  const t = useTranslations("jobs");
  const common = useTranslations("common");
  const locale = useLocale();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["work-orders", id, "detail"], queryFn: () => api<WorkOrderDetail>(`/work-orders/${id}`, { query: { include: "detail" } }) });
  const [dialog, setDialog] = useState<DialogKey>(null);

  if (query.isLoading) return <LoadingState />;
  if (query.error !== null || query.data === undefined) return <ErrorAlert error={query.error} onRetry={() => void query.refetch()} />;
  const detail = query.data;
  const wo = detail.workOrder;
  const actions = officeActions(wo);
  const refresh = async (message: string) => {
    setDialog(null);
    await client.invalidateQueries({ queryKey: ["work-orders"] });
    toast.success(message);
  };
  const actionButton = (action: OfficeAction) => {
    const icons: Record<OfficeAction, ReactElement> = {
      assign: <UserPlus aria-hidden="true" className="size-4" />,
      reassign: <Users aria-hidden="true" className="size-4" />,
      releaseHold: <PlayCircle aria-hidden="true" className="size-4" />,
      verify: <CheckCircle2 aria-hidden="true" className="size-4" />,
      reopen: <RotateCcw aria-hidden="true" className="size-4" />,
      cancel: <Ban aria-hidden="true" className="size-4" />,
      externalCost: <Receipt aria-hidden="true" className="size-4" />,
    };
    const primary = action === "assign" || action === "verify" || action === "releaseHold";
    return (
      <Button icon={icons[action]} key={action} onClick={() => setDialog(action)} variant={action === "cancel" ? "danger" : primary ? "primary" : "secondary"}>
        {t(`actions.${action}`)}
      </Button>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <>
            {actions.map(actionButton)}
            <a className={buttonVariants({ variant: "secondary" })} download={`${wo.number}.pdf`} href={`/api/v1/work-orders/${id}/report.pdf`}>
              <FileDown aria-hidden="true" className="size-4" />
              {t("actions.pdf")}
            </a>
          </>
        }
        back={{ href: "/work-orders", label: t("list.title") }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{wo.number}</span>
            <StatusBadge kind="workOrder" status={wo.status} />
            <PriorityBadge priority={wo.priority} />
            <SlaBadge sla={wo.sla} />
            {wo.hasLateEvidence ? <LateEvidenceBadge /> : null}
          </span>
        }
        title={wo.title}
      />
      <HoldBanner workOrder={wo} />
      {wo.status === "CANCELLED" && wo.cancelReason ? (
        <p className="rounded-cards border border-[var(--ar-border-strong)] bg-[var(--ar-surface-muted)] p-3">
          <span className="font-semibold">{t("detail.cancelReason")}: </span>
          {wo.cancelReason}
        </p>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4 lg:col-span-2">
          <h2 className="mb-3 text-lg font-semibold">{t("detail.summary")}</h2>
          <dl className="grid gap-4 sm:grid-cols-3">
            <Detail
              label={t("fields.asset")}
              value={
                wo.assetId === null || wo.assetId === undefined ? null : (
                  <Link className="inline-flex items-center gap-1 font-semibold text-[var(--ar-link)]" href={`/assets/${wo.assetId}`}>
                    <Tractor aria-hidden="true" className="size-4" />
                    {wo.assetCode === null || wo.assetCode === undefined ? (wo.assetName ?? "—") : `${wo.assetCode} · ${wo.assetName ?? ""}`}
                  </Link>
                )
              }
            />
            <Detail label={t("fields.type")} value={t(`enums.workOrderType.${wo.type}`)} />
            <Detail label={t("fields.assignee")} value={wo.assigneeName ?? t("unassigned")} />
            <Detail label={t("fields.site")} value={wo.siteName ?? null} />
            <Detail label={t("fields.dueAt")} value={formatDateTime(wo.dueAt, locale)} />
            <Detail label={t("fields.scheduledFor")} value={wo.scheduledFor ? formatDate(wo.scheduledFor, locale) : null} />
            <Detail label={t("fields.createdAt")} value={formatDateTime(wo.createdAt, locale)} />
            <Detail label={t("fields.createdBy")} value={wo.createdById ? (detail.names[wo.createdById] ?? null) : null} />
            <Detail
              label={t("fields.source")}
              value={
                wo.fieldReportId ? (
                  <Link className="font-semibold text-[var(--ar-link)]" href={`/reports/${wo.fieldReportId}`}>
                    {t("source.fieldReport")}
                  </Link>
                ) : wo.rentalId ? (
                  <Link className="font-semibold text-[var(--ar-link)]" href={`/rentals/${wo.rentalId}`}>
                    {t("source.rental")}
                  </Link>
                ) : wo.maintenancePlanId ? (
                  t("source.maintenance")
                ) : (
                  t("source.manual")
                )
              }
            />
            {wo.previousAssigneeIds.length === 0 ? null : <Detail label={t("fields.previousAssignees")} value={wo.previousAssigneeIds.map((userId) => detail.names[userId] ?? "—").join(", ")} />}
          </dl>
          <h3 className="mb-1 mt-4 font-semibold">{t("fields.description")}</h3>
          <p className="whitespace-pre-wrap">{wo.description ?? t("detail.noDescription")}</p>
          {wo.resolution ? (
            <>
              <h3 className="mb-1 mt-4 font-semibold">{t("fields.resolution")}</h3>
              <p className="whitespace-pre-wrap">{wo.resolution}</p>
            </>
          ) : null}
          {wo.rootCause ? (
            <>
              <h3 className="mb-1 mt-4 font-semibold">{t("fields.rootCause")}</h3>
              <p className="whitespace-pre-wrap">{wo.rootCause}</p>
            </>
          ) : null}
        </section>
        <TimesAndCosts detail={detail} locale={locale} />
      </div>
      <Checklist workOrder={wo} locale={locale} />
      <PartsPanel parts={detail.parts} />
      <ExternalCostPanel workOrder={wo} />
      <Evidence media={detail.media} />
      <Signature workOrder={wo} />
      <section className="rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4">
        <h2 className="mb-3 text-lg font-semibold">{t("detail.timeline")}</h2>
        <EntityTimeline
          entries={[...detail.timeline]
            .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
            .map((entry) => ({
              id: entry.id,
              action: t.has(`activity.${entry.action}`) ? t(`activity.${entry.action}`) : entry.action,
              actorName: entry.actorName,
              createdAt: entry.occurredAt,
              summary:
                entry.toStatus === null
                  ? typeof entry.meta.reason === "string"
                    ? entry.meta.reason
                    : null
                  : `${entry.fromStatus === null ? "—" : common(`status.workOrder.${entry.fromStatus}`)} → ${common(`status.workOrder.${entry.toStatus}`)}${typeof entry.meta.reason === "string" ? ` · ${entry.meta.reason}` : ""}`,
            }))}
        />
      </section>
      {dialog === "assign" || dialog === "reassign" ? <AssignDialog mode={dialog} onClose={() => setDialog(null)} onDone={() => void refresh(t(`toast.${dialog}`))} open workOrder={wo} /> : null}
      {dialog === "externalCost" ? <ExternalCostDialog onClose={() => setDialog(null)} onDone={() => void refresh(t("toast.externalCost"))} workOrder={wo} /> : null}
      <ConfirmDialog
        body={t("dialogs.verify.body")}
        confirmLabel={t("actions.verify")}
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          await api(`/work-orders/${id}/verify`, { method: "POST", body: {} });
          await refresh(t("toast.verify"));
        }}
        open={dialog === "verify"}
        title={t("dialogs.verify.title")}
        tone="primary"
      />
      <ConfirmDialog
        body={t("dialogs.releaseHold.body")}
        confirmLabel={t("actions.releaseHold")}
        onClose={() => setDialog(null)}
        onConfirm={async (note) => {
          await api(`/work-orders/${id}/release-hold`, { method: "POST", body: { note } });
          await refresh(t("toast.releaseHold"));
        }}
        open={dialog === "releaseHold"}
        reasonLabel={t("dialogs.releaseHold.note")}
        title={t("dialogs.releaseHold.title")}
        tone="primary"
      />
      <ConfirmDialog
        body={t("dialogs.reopen.body")}
        confirmLabel={t("actions.reopen")}
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => {
          await api(`/work-orders/${id}/reopen`, { method: "POST", body: { reason } });
          await refresh(t("toast.reopen"));
        }}
        open={dialog === "reopen"}
        reasonLabel={t("dialogs.reopen.reason")}
        title={t("dialogs.reopen.title")}
        tone="primary"
      />
      <ConfirmDialog
        body={t("dialogs.cancel.body")}
        confirmLabel={t("actions.cancel")}
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => {
          await api(`/work-orders/${id}/cancel`, { method: "POST", body: { reason } });
          await refresh(t("toast.cancel"));
        }}
        open={dialog === "cancel"}
        reasonLabel={t("dialogs.cancel.reason")}
        title={t("dialogs.cancel.title")}
      />
    </div>
  );
}

function HoldBanner({ workOrder }: { readonly workOrder: WorkOrderListItem }) {
  const t = useTranslations("jobs");
  if (workOrder.status !== "ON_HOLD") return null;
  const safety = workOrder.holdReason === "SAFETY";
  return (
    <div className={`flex items-start gap-3 rounded-cards p-4 ${safety ? "border-2 border-[var(--ar-danger)]" : "border-2 border-[var(--ar-warning)]"}`} role="status">
      {safety ? <ShieldAlert aria-hidden="true" className="mt-0.5 size-6 shrink-0" /> : <PauseCircle aria-hidden="true" className="mt-0.5 size-6 shrink-0" />}
      <div>
        <p className="font-semibold">{t("hold.title", { reason: workOrder.holdReason ? t(`enums.holdReason.${workOrder.holdReason}`) : "—" })}</p>
        <p>{safety ? t("hold.safetyBody") : (workOrder.holdNote ?? t("hold.body"))}</p>
        {safety && workOrder.holdNote ? <p className="mt-1">{workOrder.holdNote}</p> : null}
      </div>
    </div>
  );
}

function TimesAndCosts({ detail, locale }: { readonly detail: WorkOrderDetail; readonly locale: string }) {
  const t = useTranslations("jobs");
  const wo = detail.workOrder;
  const duration = (minutes: number | null | undefined) => {
    const parts = splitMinutes(minutes);
    return parts === null ? null : t("duration", parts);
  };
  const total = (wo.laborCostCents ?? 0) + (wo.partsCostCents ?? 0) + (wo.externalCostCents ?? 0);
  return (
    <section className="flex flex-col gap-3 rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4">
      <h2 className="text-lg font-semibold">{t("detail.timesAndCosts")}</h2>
      <dl className="grid grid-cols-2 gap-3">
        <Detail label={t("fields.travelTime")} value={duration(wo.travelMinutes)} />
        <Detail label={t("fields.workTime")} value={duration(wo.workMinutes)} />
        <Detail label={t("fields.startedAt")} value={formatDateTime(wo.startedAt, locale)} />
        <Detail label={t("fields.completedAt")} value={formatDateTime(wo.completedAt, locale)} />
        <Detail label={t("fields.verifiedAt")} value={wo.verifiedAt ? `${formatDateTime(wo.verifiedAt, locale)}${wo.verifiedById ? ` · ${detail.names[wo.verifiedById] ?? ""}` : ""}` : null} />
        <Detail label={t("fields.hourMeter")} value={wo.hourMeterReading === null || wo.hourMeterReading === undefined ? null : formatNumber(wo.hourMeterReading, locale, 1)} />
      </dl>
      <dl className="grid grid-cols-2 gap-3 border-t border-[var(--ar-border)] pt-3">
        <Detail label={t("fields.laborCost")} value={detail.canSeeLaborCost ? formatMoney(wo.laborCostCents, locale) : t("detail.laborHidden")} />
        <Detail label={t("fields.partsCost")} value={formatMoney(wo.partsCostCents, locale)} />
        <Detail label={t("fields.externalCost")} value={wo.externalCostCents === null || wo.externalCostCents === undefined ? null : `${formatMoney(wo.externalCostCents, locale)}${wo.externalCostNote ? ` · ${wo.externalCostNote}` : ""}`} />
        <Detail label={t("fields.totalCost")} value={<span className="font-semibold">{formatMoney(total, locale)}</span>} />
      </dl>
    </section>
  );
}

function Checklist({ workOrder, locale }: { readonly workOrder: WorkOrderListItem; readonly locale: string }) {
  const t = useTranslations("jobs");
  const items = workOrder.checklistSnapshot ?? [];
  if (items.length === 0) return null;
  const answers = new Map(workOrder.checklistResponses.map((response) => [response.key, response]));
  const label = (value: Readonly<Record<string, string>>) => value[locale] ?? value["pt-BR"] ?? Object.values(value)[0] ?? "";
  return (
    <section className="rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4">
      <h2 className="mb-3 text-lg font-semibold">{t("detail.checklist")}</h2>
      <ul className="flex flex-col divide-y divide-[var(--ar-border)]">
        {items.map((item) => {
          const answer = answers.get(item.key);
          const value = answer?.value ?? null;
          const failed = value === "FAIL";
          return (
            <li className="flex flex-wrap items-center justify-between gap-2 py-2" key={item.key}>
              <span className="flex items-center gap-2">
                {item.isSafetyCritical ? <ShieldAlert aria-label={t("detail.safetyCritical")} className="size-4 shrink-0" role="img" /> : null}
                {label(item.label)}
                {item.required ? <span className="text-sm text-[var(--ar-text-muted)]">{t("detail.required")}</span> : null}
              </span>
              <span className={`inline-flex items-center gap-1 font-semibold ${failed ? "text-[var(--ar-danger-text)]" : ""}`}>
                {failed ? <AlertTriangle aria-hidden="true" className="size-4" /> : null}
                {value === null ? t("detail.notAnswered") : typeof value === "string" && ["PASS", "FAIL", "NA"].includes(value) ? t(`enums.checklistValue.${value}`) : `${String(value)}${item.unit ? ` ${item.unit}` : ""}`}
                {answer?.note ? <span className="font-normal"> · {answer.note}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Evidence({ media }: { readonly media: readonly WorkOrderMediaItem[] }) {
  const t = useTranslations("jobs");
  const groups: ReadonlyArray<{ key: string; items: readonly WorkOrderMediaItem[] }> = [
    { key: "BEFORE", items: media.filter((m) => m.tag === "BEFORE" && m.kind !== "SIGNATURE") },
    { key: "AFTER", items: media.filter((m) => m.tag === "AFTER" && m.kind !== "SIGNATURE") },
    { key: "OTHER", items: media.filter((m) => m.tag !== "BEFORE" && m.tag !== "AFTER" && m.kind !== "SIGNATURE") },
  ];
  const late = media.filter((m) => m.isLateEvidence);
  const gallery = (items: readonly WorkOrderMediaItem[]): GalleryItem[] => items.map((m) => ({ id: m.id, kind: m.kind as GalleryItem["kind"], status: m.status as GalleryItem["status"], caption: m.isLateEvidence ? `${t("flags.lateEvidence")}${m.caption ? ` · ${m.caption}` : ""}` : m.caption }));
  return (
    <section className="flex flex-col gap-4 rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4">
      <h2 className="text-lg font-semibold">{t("detail.evidence")}</h2>
      {late.length === 0 ? null : (
        <p className="flex items-center gap-2 rounded-cards border-2 border-[var(--ar-warning)] p-3" role="status">
          <ImageOff aria-hidden="true" className="size-5 shrink-0" />
          {t("detail.lateEvidence", { count: late.length })}
        </p>
      )}
      {groups.every((group) => group.items.length === 0) ? <p className="text-[var(--ar-text-muted)]">{t("detail.noEvidence")}</p> : null}
      {groups.map((group) =>
        group.items.length === 0 ? null : (
          <div className="flex flex-col gap-2" key={group.key}>
            <h3 className="font-semibold">{t(`detail.evidenceGroup.${group.key}`)}</h3>
            <MediaGallery items={gallery(group.items)} />
          </div>
        ),
      )}
    </section>
  );
}

function Signature({ workOrder }: { readonly workOrder: WorkOrderListItem }) {
  const t = useTranslations("jobs");
  if (workOrder.signatureStatus === null || workOrder.signatureStatus === undefined) return null;
  return (
    <section className="rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4">
      <h2 className="mb-3 text-lg font-semibold">{t("detail.signature")}</h2>
      <dl className="grid gap-4 sm:grid-cols-3">
        <Detail label={t("fields.signatureStatus")} value={t(`enums.signatureStatus.${workOrder.signatureStatus}`)} />
        <Detail label={t("fields.signer")} value={workOrder.customerSignerName ?? null} />
        <Detail label={t("fields.witness")} value={workOrder.signatureWitnessName ?? null} />
        {workOrder.signatureReason ? <Detail label={t("fields.signatureReason")} value={workOrder.signatureReason} /> : null}
      </dl>
    </section>
  );
}
