"use client";

import type { ProviderInviteStatus, ProviderReviewDTO } from "@agrorende/contracts";
import { Ban, CheckCircle2, Clock, Eye, Handshake, MessageSquareReply, Send, Star, XCircle } from "lucide-react";
import { NextIntlClientProvider, useLocale, useMessages, useTimeZone, useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { Badge, type Tone } from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/format";

import enProviders from "../../../messages/en/providers.json";
import ptProviders from "../../../messages/pt-BR/providers.json";

/** Brings the `providers` namespace along, like the comment thread does, so any page can mount these components. */
export function ProvidersIntl({ children }: { readonly children: ReactNode }): ReactElement {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const messages = useMessages();
  const own = locale.startsWith("pt") ? ptProviders : enProviders;
  return (
    <NextIntlClientProvider locale={locale} messages={{ ...messages, providers: own }} timeZone={timeZone}>
      {children}
    </NextIntlClientProvider>
  );
}

const STATUS_TONE: Record<ProviderInviteStatus, Tone> = {
  SENT: "info",
  OPENED: "info",
  COUNTERED: "warning",
  ACCEPTED: "primary",
  COMPLETED: "success",
  DECLINED: "danger",
  EXPIRED: "neutral",
  REVOKED: "neutral",
};

const STATUS_ICON: Record<ProviderInviteStatus, ReactElement> = {
  SENT: <Send aria-hidden="true" className="size-4" />,
  OPENED: <Eye aria-hidden="true" className="size-4" />,
  COUNTERED: <Handshake aria-hidden="true" className="size-4" />,
  ACCEPTED: <CheckCircle2 aria-hidden="true" className="size-4" />,
  COMPLETED: <CheckCircle2 aria-hidden="true" className="size-4" />,
  DECLINED: <XCircle aria-hidden="true" className="size-4" />,
  EXPIRED: <Clock aria-hidden="true" className="size-4" />,
  REVOKED: <Ban aria-hidden="true" className="size-4" />,
};

export function InviteStatusBadge({ status }: { readonly status: ProviderInviteStatus }): ReactElement {
  const t = useTranslations("providers.invite.statuses");
  return (
    <Badge icon={STATUS_ICON[status]} tone={STATUS_TONE[status]}>
      {t(status)}
    </Badge>
  );
}

/** A 1–5 score as five 48 px radio buttons with a star icon and the number as text (A§3.7). */
export function ScoreInput({ label, value, onChange, name }: { readonly label: string; readonly value: number; readonly onChange: (value: number) => void; readonly name: string }): ReactElement {
  const t = useTranslations("providers.review");
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-sm font-semibold">{label}</legend>
      <div aria-label={label} className="flex flex-wrap gap-1" role="radiogroup">
        {[1, 2, 3, 4, 5].map((score) => {
          const active = score <= value;
          return (
            <button
              aria-checked={score === value}
              aria-label={`${label}: ${t("stars", { count: score })}`}
              className={`inline-flex min-h-12 min-w-12 items-center justify-center gap-1 rounded-controls border text-sm font-semibold ${active ? "border-[var(--ar-primary)] bg-[var(--ar-primary)] text-[var(--ar-on-primary)]" : "border-[var(--ar-border-strong)] bg-[var(--ar-surface)] text-[var(--ar-text)]"}`}
              data-name={name}
              key={score}
              onClick={() => onChange(score)}
              role="radio"
              type="button"
            >
              <Star aria-hidden="true" className="size-4" fill={active ? "currentColor" : "none"} />
              {score}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ScoreText({ value }: { readonly value: number }): ReactElement {
  const t = useTranslations("providers.review");
  return (
    <span className="inline-flex items-center gap-1 font-semibold">
      <Star aria-hidden="true" className="size-4 text-[var(--ar-warning)]" fill="currentColor" />
      {t("stars", { count: value })}
    </span>
  );
}

/** The review and its short thread, shared by the office card and the magic-link page. */
export function ReviewSummary({ review, children }: { readonly review: ProviderReviewDTO; readonly children?: ReactNode }): ReactElement {
  const t = useTranslations("providers.review");
  const locale = useLocale();
  const criteria = ["punctuality", "quality", "price", "communication"] as const;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <ScoreText value={review.rating} />
        <time className="text-sm text-[var(--ar-text-muted)]" dateTime={review.createdAt}>
          {formatDateTime(review.createdAt, locale)}
        </time>
        {review.moderationStatus === "FLAGGED" ? <Badge tone="warning">{t("reported")}</Badge> : null}
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {criteria.map((key) => (
          <div className="rounded-controls bg-[var(--ar-surface-muted)] p-2" key={key}>
            <dt className="text-xs text-[var(--ar-text-muted)]">{t(`criteria.${key}`)}</dt>
            <dd className="font-semibold">{review.criteria[key]}/5</dd>
          </div>
        ))}
      </dl>
      {review.comment === null ? null : <p className="whitespace-pre-wrap break-words">{review.comment}</p>}
      {review.providerReply === null ? null : <Reply at={review.providerReply.at} body={review.providerReply.body} label={t("providerReply")} />}
      {review.customerReply === null ? null : <Reply at={review.customerReply.at} body={review.customerReply.body} label={t("customerReply")} />}
      {review.threadStatus === "CLOSED" ? <p className="text-sm text-[var(--ar-text-muted)]">{t("closed")}</p> : null}
      {children}
    </div>
  );
}

function Reply({ label, body, at }: { readonly label: string; readonly body: string; readonly at: string }): ReactElement {
  const locale = useLocale();
  return (
    <div className="rounded-controls border-l-4 border-[var(--ar-primary)] bg-[var(--ar-surface-muted)] p-3">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <MessageSquareReply aria-hidden="true" className="size-4" />
        <span className="font-semibold">{label}</span>
        <time className="text-[var(--ar-text-muted)]" dateTime={at}>
          {formatDateTime(at, locale)}
        </time>
      </p>
      <p className="mt-1 whitespace-pre-wrap break-words">{body}</p>
    </div>
  );
}

/** Both off-platform payment confirmations with their timestamps (#65). */
export function PaymentConfirmations({ customerPaidAt, providerPaidAt }: { readonly customerPaidAt: string | null; readonly providerPaidAt: string | null }): ReactElement {
  const t = useTranslations("providers.payment");
  const locale = useLocale();
  const row = (label: string, at: string | null) => (
    <li className="flex flex-wrap items-center gap-2">
      {at === null ? <Clock aria-hidden="true" className="size-4 text-[var(--ar-text-muted)]" /> : <CheckCircle2 aria-hidden="true" className="size-4 text-[var(--ar-success)]" />}
      <span className="font-semibold">{label}</span>
      <span className="text-sm text-[var(--ar-text-muted)]">{at === null ? t("pending") : t("confirmedAt", { date: formatDateTime(at, locale) })}</span>
    </li>
  );
  return (
    <ul className="flex flex-col gap-1">
      {row(t("customer"), customerPaidAt)}
      {row(t("provider"), providerPaidAt)}
    </ul>
  );
}
