"use client";

import { useQuery } from "@tanstack/react-query";
import { AlarmClock, CalendarCheck, CalendarPlus, CheckCircle2, FileText, Tractor, XCircle } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/data/badges";
import { Detail } from "@/components/data/Detail";
import { EntityTimeline } from "@/components/data/EntityTimeline";
import { LoadingState } from "@/components/data/States";
import { ConfirmDialog } from "@/components/forms/ConfirmDialog";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button, buttonVariants } from "@/components/ui/Button";
import { BillingActions } from "@/features/billing";
import { api } from "@/lib/api";
import { formatDateTime, formatMoney, maskTaxId } from "@/lib/format";
import { useSave } from "@/lib/useSave";

import { ChargesEditor } from "./ChargesEditor";
import { CloseRentalDialog } from "./CloseRentalDialog";
import { DamagesPanel } from "./DamagesPanel";
import { ExtendRentalDialog } from "./ExtendRentalDialog";
import { InspectionsCompare } from "./InspectionsCompare";
import { OverdueBadge } from "./OverdueBadge";
import { directionLabels, inboundMissingOf, reserveCodesOf, rentalActions, type RentalDetail, type RentalDTO } from "./types";

type Dialog = "cancel" | "close" | "extend" | null;

/** Office view of one rental (RN-11): summary, inspections side by side, damages, charges and close. */
export function RentalDetailPage({ id }: { readonly id: string }) {
  const t = useTranslations("rentals");
  const common = useTranslations("common");
  const errors = useTranslations("errors");
  const locale = useLocale();
  const query = useQuery({ queryKey: ["rentals", id], queryFn: () => api<RentalDetail>(`/rentals/${id}`) });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [reserve, reserveState] = useSave("rentals", (version: string) => api<RentalDTO>(`/rentals/${id}/reserve`, { method: "POST", body: {}, version }), () => toast.success(t("toast.reserved")));

  if (query.isLoading) return <LoadingState />;
  if (query.error !== null || query.data === undefined) return <ErrorAlert error={query.error} onRetry={() => void query.refetch()} />;
  const rental = query.data;
  const actions = rentalActions(rental.status);
  const customer = rental.customerSnapshot;
  // Office roles see the full CPF/CNPJ (PRD §5); it is only formatted for reading.
  const taxId = customer?.taxId === null || customer?.taxId === undefined ? (customer?.taxIdMasked ?? null) : maskTaxId(customer.taxId);
  const reserveCodes = reserveCodesOf(reserveState.error);
  const compareId = rental.checkInInspectionId ?? rental.checkOutInspectionId ?? null;
  const inboundMissing = inboundMissingOf(reserveState.error);
  const labels = directionLabels(rental.direction);
  const billable = rental.direction === "OUTBOUND" && (rental.status === "RETURNED" || rental.status === "CLOSED");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <>
            {rental.checkOutInspectionId === null || rental.checkOutInspectionId === undefined ? null : (
              <a className={buttonVariants({ variant: "secondary" })} href={`/api/v1/rentals/${id}/checkout.pdf`} rel="noopener" target="_blank">
                <FileText aria-hidden="true" className="size-4" />
                {t("actions.checkoutPdf")}
              </a>
            )}
            {rental.checkInInspectionId === null || rental.checkInInspectionId === undefined ? null : (
              <a className={buttonVariants({ variant: "secondary" })} href={`/api/v1/rentals/${id}/checkin.pdf`} rel="noopener" target="_blank">
                <FileText aria-hidden="true" className="size-4" />
                {t("actions.checkinPdf")}
              </a>
            )}
            {actions.reserve ? (
              <Button busy={reserveState.busy} icon={<CalendarCheck aria-hidden="true" className="size-4" />} onClick={() => void reserve(String(rental.syncVersion))} variant="primary">
                {t("actions.reserve")}
              </Button>
            ) : null}
            {actions.extend ? (
              <Button icon={<CalendarPlus aria-hidden="true" className="size-4" />} onClick={() => setDialog("extend")}>
                {t("actions.extend")}
              </Button>
            ) : null}
            {actions.close ? (
              <Button icon={<CheckCircle2 aria-hidden="true" className="size-4" />} onClick={() => setDialog("close")} variant="primary">
                {t("actions.close")}
              </Button>
            ) : null}
            {actions.cancel ? (
              <Button icon={<XCircle aria-hidden="true" className="size-4" />} onClick={() => setDialog("cancel")} variant="danger">
                {t("actions.cancel")}
              </Button>
            ) : null}
          </>
        }
        back={{ href: "/rentals", label: t("list.title") }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge kind="rental" status={rental.status} />
            {rental.isOverdue ? <OverdueBadge /> : null}
          </span>
        }
        title={t("detail.title", { number: rental.number })}
      />
      {reserveState.error === null ? null : inboundMissing !== null ? (
        <div className="flex flex-col gap-2 rounded-cards border-2 border-[var(--ar-danger)] p-4" role="alert">
          <p className="font-semibold">{t("inbound.incompleteTitle")}</p>
          <p>{t("inbound.incompleteBody")}</p>
          <ul className="list-disc pl-5">
            {inboundMissing.map((part) => (
              <li key={part}>{t.has(`inbound.missing.${part}`) ? t(`inbound.missing.${part}`) : part}</li>
            ))}
          </ul>
        </div>
      ) : reserveCodes.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-cards border-2 border-[var(--ar-danger)] p-4" role="alert">
          <p className="font-semibold">{t("new.reserveBlocked")}</p>
          <ul className="list-disc pl-5">
            {reserveCodes.map((code) => (
              <li key={code}>
                <span className="font-semibold">{errors(`${code}.title`)}</span> — {errors(`${code}.body`)}
              </li>
            ))}
          </ul>
          {reserveCodes.includes("CUSTOMER_INCOMPLETE") ? (
            <Link className="font-semibold text-[var(--ar-link)]" href={`/customers/${rental.customerId}`}>
              {t("new.completeCustomer")}
            </Link>
          ) : null}
        </div>
      ) : (
        <ErrorAlert error={reserveState.error} onRetry={() => void query.refetch()} />
      )}
      {rental.isOverdue ? (
        <p className="flex items-center gap-2 rounded-cards border-2 border-[var(--ar-danger)] p-3 font-semibold" role="status">
          <AlarmClock aria-hidden="true" className="size-5" />
          {t("detail.overdueBody", { end: formatDateTime(rental.plannedEnd, locale) })}
        </p>
      ) : null}
      <section className="rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4">
        <h2 className="mb-3 text-lg font-semibold">{t("detail.summary")}</h2>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Detail
            label={t("fields.asset")}
            value={
              <Link className="inline-flex items-center gap-1 font-semibold text-[var(--ar-link)]" href={`/assets/${rental.asset.id}`}>
                <Tractor aria-hidden="true" className="size-4" />
                {rental.asset.code} · {rental.asset.name}
              </Link>
            }
          />
          <Detail label={t("fields.direction")} value={t(`direction.${rental.direction === "INBOUND" ? "INBOUND" : "OUTBOUND"}`)} />
          <Detail
            label={t(`fields.${labels.party}`)}
            value={
              <Link className="font-semibold text-[var(--ar-link)]" href={`/customers/${rental.customerId}`}>
                {customer?.name ?? "—"}
              </Link>
            }
          />
          <Detail label={t("fields.taxId")} value={taxId} />
          <Detail label={t("fields.period")} value={`${formatDateTime(rental.plannedStart, locale)} → ${formatDateTime(rental.plannedEnd, locale)}`} />
          <Detail label={t(`fields.actualStart${labels.checkout === "receive" ? "Inbound" : ""}`)} value={rental.actualStart === null || rental.actualStart === undefined ? null : formatDateTime(rental.actualStart, locale)} />
          <Detail label={t(`fields.actualEnd${labels.checkin === "return" ? "Inbound" : ""}`)} value={rental.actualEnd === null || rental.actualEnd === undefined ? null : formatDateTime(rental.actualEnd, locale)} />
          <Detail label={t("fields.rate")} value={`${formatMoney(rental.rateCents, locale)} / ${common(`rateUnit.${rental.rateUnit}`)}`} />
          <Detail label={t("fields.deposit")} value={formatMoney(rental.depositCents, locale)} />
          <Detail label={t("fields.deliveryMode")} value={t(`deliveryMode.${rental.deliveryMode}`)} />
          <Detail label={t("fields.termsVersion")} value={rental.termsVersion === null || rental.termsVersion === undefined ? t("detail.termsPending") : t("detail.termsVersionValue", { version: rental.termsVersion })} />
          <Detail label={t("fields.documentLocale")} value={t(`documentLocale.${rental.documentLocale === "en" ? "en" : "ptBR"}`)} />
          {rental.cancelReason === null || rental.cancelReason === undefined ? null : <Detail label={t("fields.cancelReason")} value={rental.cancelReason} />}
        </dl>
      </section>
      <section className="rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4">
        <h2 className="mb-3 text-lg font-semibold">{t("inspections.title")}</h2>
        <InspectionsCompare inspectionId={compareId} />
      </section>
      <section className="rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4">
        <h2 className="mb-3 text-lg font-semibold">{t("damages.title")}</h2>
        <DamagesPanel damages={rental.damages} editable={rental.status === "RETURNED"} />
      </section>
      <section className="rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4">
        <h2 className="mb-3 text-lg font-semibold">{t("charges.title")}</h2>
        <ChargesEditor editable={actions.editCharges} rentalId={id} />
      </section>
      {billable ? <BillingActions entityId={id} entityType="RENTAL" /> : null}
      <section className="rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4">
        <h2 className="mb-3 text-lg font-semibold">{t("detail.activity")}</h2>
        <EntityTimeline
          entries={[...rental.activity]
            .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
            .map((a) => ({
              id: a.id,
              action: t.has(`activity.${a.action}`) ? t(`activity.${a.action}`) : a.action,
              createdAt: a.occurredAt,
              summary: a.toStatus === null || a.toStatus === undefined ? null : `${a.fromStatus === null || a.fromStatus === undefined ? "—" : common(`status.rental.${a.fromStatus}`)} → ${common(`status.rental.${a.toStatus}`)}`,
            }))}
        />
      </section>
      {dialog === "close" ? (
        <CloseRentalDialog
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            toast.success(t("toast.closed"));
          }}
          open
          rentalId={id}
          totals={{ chargesVersion: rental.charges.chargesVersion, totalCents: rental.charges.totalCents, balanceDueCents: rental.charges.balanceDueCents }}
        />
      ) : null}
      {dialog === "extend" ? (
        <ExtendRentalDialog
          assetId={rental.assetId}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            toast.success(t("toast.extended"));
          }}
          plannedEnd={rental.plannedEnd}
          rentalId={id}
        />
      ) : null}
      <ConfirmDialog
        body={t("cancel.body")}
        confirmLabel={t("actions.cancel")}
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => {
          await api<RentalDTO>(`/rentals/${id}/cancel`, { method: "POST", body: { reason } });
          await query.refetch();
          toast.success(t("toast.cancelled"));
        }}
        open={dialog === "cancel"}
        reasonLabel={t("cancel.reason")}
        title={t("cancel.title")}
      />
    </div>
  );
}
