"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileCheck2, MessageCircle, XCircle } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import type { SubscriptionDTO } from "@agrorende/core/modules/tenancy/dto";

import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { LoadingState } from "@/components/data/States";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Field";
import { OrgStatusBadge } from "@/features/tenancy/OrgStatusBadge";
import { whatsAppHref } from "@/features/tenancy/orgBanner";
import { formatDay } from "@/features/tenancy/TenancyOrgBanner";
import { api, ApiError } from "@/lib/api";

import { formatBytes, statusWindow, type StatusWindow } from "./window";

const QUERY_KEY = ["org", "subscription"] as const;

function sameName(a: string, b: string): boolean {
  const normalize = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
  return normalize(a) === normalize(b);
}

/** The one bold element of the page: how many days are left in the window that matters now. */
function WindowMeter({ countdown, locale, timeZone }: { readonly countdown: StatusWindow; readonly locale: string; readonly timeZone: string | undefined }) {
  const t = useTranslations("subscription");
  const remaining = Math.round((countdown.daysLeft / countdown.totalDays) * 100);
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-baseline gap-3">
        <span className="text-5xl font-bold tabular-nums leading-none">{countdown.daysLeft}</span>
        <span className="text-base text-[var(--ar-text-muted)]">{t(`countdown.${countdown.kind}.unit`, { days: countdown.daysLeft })}</span>
      </p>
      <div
        aria-label={t(`countdown.${countdown.kind}.label`, { date: formatDay(countdown.endsAt, locale, timeZone) })}
        aria-valuemax={countdown.totalDays}
        aria-valuemin={0}
        aria-valuenow={countdown.daysLeft}
        className="h-3 overflow-hidden rounded-full bg-[var(--ar-surface-muted)]"
        role="meter"
      >
        <div className={`h-full ${countdown.kind === "trial" ? "bg-[var(--ar-info)]" : countdown.kind === "grace" ? "bg-[var(--ar-warning)]" : "bg-[var(--ar-text-muted)]"}`} style={{ width: `${remaining}%` }} />
      </div>
      <p className="text-sm">{t(`countdown.${countdown.kind}.label`, { date: formatDay(countdown.endsAt, locale, timeZone) })}</p>
    </div>
  );
}

function CancelDialog({ open, onClose, orgName }: { readonly open: boolean; readonly onClose: () => void; readonly orgName: string }) {
  const t = useTranslations("subscription");
  const common = useTranslations("common");
  const client = useQueryClient();
  const [confirmName, setConfirmName] = useState("");
  const mutation = useMutation({
    mutationFn: () => api<SubscriptionDTO>("/org/cancel", { method: "POST", body: { confirmName } }),
    onSuccess: (data) => {
      client.setQueryData(QUERY_KEY, data);
      void client.invalidateQueries({ queryKey: ["me"] });
      toast.success(t("cancel.done"));
      onClose();
    },
  });
  const matches = sameName(confirmName, orgName);
  const nameError = mutation.error instanceof ApiError && mutation.error.fieldErrors.some((fe) => fe.path === "confirmName") ? t("cancel.mismatch") : undefined;
  return (
    <Dialog
      closeLabel={common("actions.close")}
      description={t("cancel.description")}
      dismissible={!mutation.isPending}
      footer={
        <>
          <Button disabled={mutation.isPending} onClick={onClose}>
            {t("cancel.keep")}
          </Button>
          <Button busy={mutation.isPending} disabled={!matches} icon={<XCircle aria-hidden="true" className="size-5" />} onClick={() => mutation.mutate()} variant="danger">
            {t("cancel.confirm")}
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      title={t("cancel.title")}
    >
      <div className="flex flex-col gap-4">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>{t("cancel.consequences.readOnly")}</li>
          <li>{t("cancel.consequences.export")}</li>
          <li>{t("cancel.consequences.purge")}</li>
        </ul>
        {mutation.error !== null && nameError === undefined ? <ErrorAlert error={mutation.error} /> : null}
        <Field error={nameError} hint={t("cancel.hint", { name: orgName })} label={t("cancel.nameLabel")} required>
          {(p) => <Input {...p} autoComplete="off" name="confirmName" onChange={(e) => setConfirmName(e.target.value)} value={confirmName} />}
        </Field>
      </div>
    </Dialog>
  );
}

function TermsSection({ data }: { readonly data: SubscriptionDTO }) {
  const t = useTranslations("subscription");
  const locale = useLocale();
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api<SubscriptionDTO>("/org/accept-terms", { method: "POST", body: { version: data.terms.currentVersion } }),
    onSuccess: (next) => {
      client.setQueryData(QUERY_KEY, next);
      toast.success(t("terms.accepted"));
    },
  });
  return (
    <section aria-labelledby="terms-title" className="flex flex-col gap-3 border-t border-[var(--ar-border)] pt-6">
      <h2 className="text-lg font-semibold" id="terms-title">
        {t("terms.title")}
      </h2>
      {data.terms.needsAcceptance ? (
        <div className="flex flex-col gap-3 rounded-cards border border-[var(--ar-warning)] bg-[var(--ar-warning-bg)] p-4">
          <p className="text-sm">{t("terms.needsAcceptance", { version: data.terms.currentVersion })}</p>
          {mutation.error === null ? null : <ErrorAlert error={mutation.error} />}
          <Button busy={mutation.isPending} className="w-fit" icon={<FileCheck2 aria-hidden="true" className="size-5" />} onClick={() => mutation.mutate()} variant="primary">
            {t("terms.accept")}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-[var(--ar-text-muted)]">
          {t("terms.current", { version: data.terms.acceptedVersion ?? data.terms.currentVersion, date: data.terms.acceptedAt === null ? "" : formatDay(data.terms.acceptedAt, locale, undefined) })}
        </p>
      )}
    </section>
  );
}

export function SubscriptionView({ data, now = new Date() }: { readonly data: SubscriptionDTO; readonly now?: Date }) {
  const t = useTranslations("subscription");
  const locale = useLocale();
  const [cancelOpen, setCancelOpen] = useState(false);
  const countdown = statusWindow(data, now);
  const support = whatsAppHref(data.supportWhatsApp);
  const number = new Intl.NumberFormat(locale);
  const monthFormat = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader subtitle={data.name} title={t("title")} />

      <section aria-labelledby="status-title" className="grid gap-6 rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4 sm:p-6 md:grid-cols-[1fr_minmax(0,18rem)]">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold" id="status-title">
              {t("status.title")}
            </h2>
            <OrgStatusBadge status={data.status} />
          </div>
          <p className="max-w-prose">{t(`status.explain.${data.status}`)}</p>
          {data.readOnly ? <p className="text-sm font-semibold">{t("status.readOnly")}</p> : null}
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            <dt className="text-[var(--ar-text-muted)]">{t("plan.label")}</dt>
            <dd className="font-semibold">{t.has(`plan.names.${data.plan}`) ? t(`plan.names.${data.plan}`) : data.plan}</dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            {support === null ? null : (
              <a className={buttonVariants({ variant: data.readOnly ? "primary" : "secondary" })} href={support} rel="noopener noreferrer" target="_blank">
                <MessageCircle aria-hidden="true" className="size-5" />
                {t("support")}
              </a>
            )}
          </div>
        </div>
        {countdown === null ? null : <WindowMeter countdown={countdown} locale={locale} timeZone={undefined} />}
      </section>

      {data.readOnly ? (
        <section aria-labelledby="export-title" className="flex flex-col gap-2 rounded-cards border border-[var(--ar-border-strong)] bg-[var(--ar-surface)] p-4">
          <h2 className="text-lg font-semibold" id="export-title">
            {t("export.title")}
          </h2>
          <p className="text-sm">{data.exportDeadline === null ? t("export.body") : t("export.bodyDeadline", { date: formatDay(data.exportDeadline, locale, undefined) })}</p>
          <Link className={`${buttonVariants({ variant: "secondary" })} w-fit`} href="/reports">
            <Download aria-hidden="true" className="size-5" />
            {t("export.action")}
          </Link>
        </section>
      ) : null}

      <section aria-labelledby="usage-title" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold" id="usage-title">
          {t("usage.title")}
        </h2>
        {data.usage.length === 0 ? (
          <p className="text-sm text-[var(--ar-text-muted)]">{t("usage.empty")}</p>
        ) : (
          <div className="overflow-x-auto rounded-cards border border-[var(--ar-border)]">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <caption className="sr-only">{t("usage.title")}</caption>
              <thead className="bg-[var(--ar-surface-muted)]">
                <tr>
                  <th className="px-3 py-3 font-semibold" scope="col">{t("usage.month")}</th>
                  <th className="px-3 py-3 text-right font-semibold" scope="col">{t("usage.activeFieldUsers")}</th>
                  <th className="px-3 py-3 text-right font-semibold" scope="col">{t("usage.officeUsers")}</th>
                  <th className="px-3 py-3 text-right font-semibold" scope="col">{t("usage.assetCount")}</th>
                  <th className="px-3 py-3 text-right font-semibold" scope="col">{t("usage.storage")}</th>
                </tr>
              </thead>
              <tbody>
                {data.usage.map((row) => (
                  <tr className="border-t border-[var(--ar-border)]" key={row.month}>
                    <th className="px-3 py-3 font-semibold capitalize" scope="row">{monthFormat.format(new Date(`${row.month}T00:00:00Z`))}</th>
                    <td className="px-3 py-3 text-right tabular-nums">{number.format(row.activeFieldUsers)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{number.format(row.officeUsers)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{number.format(row.assetCount)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatBytes(row.storageBytes, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-sm text-[var(--ar-text-muted)]">{t("usage.note")}</p>
      </section>

      <TermsSection data={data} />

      {data.status === "CANCELLED" ? null : (
        <section aria-labelledby="cancel-title" className="flex flex-col gap-3 border-t border-[var(--ar-border)] pt-6">
          <h2 className="text-lg font-semibold" id="cancel-title">
            {t("cancel.sectionTitle")}
          </h2>
          <p className="max-w-prose text-sm">{t("cancel.sectionBody")}</p>
          <Button className="w-fit" icon={<XCircle aria-hidden="true" className="size-5" />} onClick={() => setCancelOpen(true)} variant="secondary">
            {t("cancel.open")}
          </Button>
          <CancelDialog onClose={() => setCancelOpen(false)} open={cancelOpen} orgName={data.name} />
        </section>
      )}
    </div>
  );
}

/** Settings → Subscription (ADMIN): status, plan, usage, terms, export guidance and cancel (TEN-02..TEN-07). */
export function SubscriptionPage() {
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: () => api<SubscriptionDTO>("/org/subscription") });
  if (query.isLoading) return <LoadingState rows={6} />;
  if (query.error !== null) return <ErrorAlert error={query.error} onRetry={() => void query.refetch()} />;
  if (query.data === undefined) return null;
  return <SubscriptionView data={query.data} />;
}
