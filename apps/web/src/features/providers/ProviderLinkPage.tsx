"use client";

import type { ProviderLinkViewDTO } from "@agrorende/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, Flag, Handshake, Link2Off, MapPin, Send, Sparkles, Tractor, Wallet, XCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, type ReactElement, type ReactNode } from "react";
import { toast } from "sonner";

import { MoneyInput } from "@/components/forms/MoneyInput";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { api, isApiError } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";

import { InviteStatusBadge, PaymentConfirmations, ProvidersIntl, ReviewSummary } from "./shared";

export type ProviderLinkFailure = "invalid" | "expired" | "revoked";

export interface ProviderLinkPageProps {
  readonly token: string;
  /** Rendered on the server so the first paint needs no extra request; `null` lets the client fetch and show the error. */
  readonly initial: ProviderLinkViewDTO | null;
  readonly signupUrl: string;
  readonly homeUrl: string;
}

/** The public magic-link page for an invited provider (#64): no login, only this job, never a dead end. */
export function ProviderLinkPage(props: ProviderLinkPageProps): ReactElement {
  return (
    <ProvidersIntl>
      <LinkPage {...props} />
    </ProvidersIntl>
  );
}

/** EC-PRV-01: invalid, expired or revoked link — say why and what to do next. */
export function ProviderLinkRecovery({ reason, homeUrl }: { readonly reason: ProviderLinkFailure; readonly homeUrl: string }): ReactElement {
  return (
    <ProvidersIntl>
      <Recovery homeUrl={homeUrl} reason={reason} />
    </ProvidersIntl>
  );
}

function Recovery({ reason, homeUrl }: { readonly reason: ProviderLinkFailure; readonly homeUrl: string }): ReactElement {
  const t = useTranslations("providers.link.recovery");
  return (
    <section className="flex w-full max-w-lg flex-col gap-4 rounded-cards border border-[var(--ar-border-strong)] bg-[var(--ar-surface)] p-6" role="alert">
      <h1 className="flex items-center gap-2 text-xl font-semibold">
        <Link2Off aria-hidden="true" className="size-6 text-[var(--ar-danger)]" />
        {t("title")}
      </h1>
      <p>{t(reason)}</p>
      <p className="font-semibold">{t("next")}</p>
      <a className={buttonVariants({ variant: "secondary" })} href={homeUrl}>
        {t("home")}
      </a>
    </section>
  );
}

function failureOf(error: unknown): ProviderLinkFailure | null {
  if (!isApiError(error, "INVITE_EXPIRED")) return null;
  const reason = error.details.reason;
  return reason === "expired" || reason === "revoked" ? reason : "invalid";
}

function Row({ icon, label, children }: { readonly icon: ReactNode; readonly label: string; readonly children: ReactNode }): ReactElement {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-[var(--ar-text-muted)]">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm text-[var(--ar-text-muted)]">{label}</p>
        <div className="break-words">{children}</div>
      </div>
    </div>
  );
}

type Panel = "decline" | "counter" | "complete" | "reply" | "report" | null;

function LinkPage({ token, initial, signupUrl, homeUrl }: ProviderLinkPageProps): ReactElement {
  const t = useTranslations("providers.link");
  const all = useTranslations("providers");
  const locale = useLocale();
  const client = useQueryClient();
  const key = ["provider-link", token] as const;
  const path = `/provider-links/${encodeURIComponent(token)}`;
  const query = useQuery({
    queryKey: key,
    queryFn: () => api<ProviderLinkViewDTO>(path, { skipAuthRetry: true }),
    ...(initial === null ? {} : { initialData: initial }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const act = async (action: string, body: Record<string, unknown>, message: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const view = await api<ProviderLinkViewDTO>(`${path}/${action}`, { method: "POST", body, skipAuthRetry: true });
      client.setQueryData(key, view);
      setPanel(null);
      toast.success(message);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  const failure = failureOf(query.error) ?? failureOf(error);
  if (failure !== null) return <Recovery homeUrl={homeUrl} reason={failure} />;
  if (query.data === undefined) {
    return <div className="w-full max-w-2xl">{query.error === null ? <p aria-busy="true">…</p> : <ErrorAlert error={query.error} onRetry={() => void query.refetch()} />}</div>;
  }
  const view = query.data;
  const { invite, workOrder } = view;
  const pending = invite.status === "SENT" || invite.status === "OPENED";
  const engaged = invite.status === "ACCEPTED" || invite.status === "COMPLETED";
  const review = view.review;

  return (
    <article className="flex w-full max-w-2xl flex-col gap-5 rounded-cards border border-[var(--ar-border-strong)] bg-[var(--ar-surface)] p-5 sm:p-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-semibold uppercase text-[var(--ar-text-muted)]">{t("title")}</p>
        <h1 className="text-2xl font-semibold">{workOrder.title}</h1>
        <p>{t("from", { org: view.organizationName })}</p>
        <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--ar-text-muted)]">
          <span>{t("job", { number: workOrder.number })}</span>
          <InviteStatusBadge status={invite.status} />
        </div>
        <p className="text-sm text-[var(--ar-text-muted)]">{t("noLogin")}</p>
      </header>

      {invite.message === null ? null : <p className="whitespace-pre-wrap break-words rounded-controls bg-[var(--ar-surface-muted)] p-3">{invite.message}</p>}

      <div className="flex flex-col gap-4">
        {workOrder.description === null ? null : (
          <Row icon={<Handshake aria-hidden="true" className="size-5" />} label={t("description")}>
            <p className="whitespace-pre-wrap">{workOrder.description}</p>
          </Row>
        )}
        {workOrder.asset === null ? null : (
          <Row icon={<Tractor aria-hidden="true" className="size-5" />} label={t("machine")}>
            <p>{[workOrder.asset.name, [workOrder.asset.make, workOrder.asset.model].filter((part): part is string => part !== null).join(" ")].filter((part) => part.length > 0).join(" · ")}</p>
          </Row>
        )}
        {workOrder.site === null ? null : (
          <Row icon={<MapPin aria-hidden="true" className="size-5" />} label={t("place")}>
            <p>{[workOrder.site.name, [workOrder.site.city, workOrder.site.state].filter((part): part is string => part !== null).join(" / ")].filter((part) => part.length > 0).join(" · ")}</p>
            {workOrder.site.mapUrl === null ? null : (
              <a className={`${buttonVariants({ variant: "secondary" })} mt-2`} href={workOrder.site.mapUrl} rel="noopener noreferrer" target="_blank">
                <MapPin aria-hidden="true" className="size-4" />
                {t("openMap")}
              </a>
            )}
          </Row>
        )}
        <Row icon={<CalendarDays aria-hidden="true" className="size-5" />} label={t("requestedFor")}>
          <p>{workOrder.scheduledFor === null ? t("notScheduled") : formatDate(workOrder.scheduledFor, locale)}</p>
        </Row>
      </div>

      {invite.status in ANSWERED ? <p className="rounded-controls border-l-4 border-[var(--ar-primary)] bg-[var(--ar-primary-bg)] p-3 font-semibold">{t(`answered.${invite.status as keyof typeof ANSWERED}`)}</p> : null}

      {invite.agreedValueCents === null ? null : (
        <div className="flex flex-col gap-1">
          <p className="font-semibold">{t("agreed", { value: formatMoney(invite.agreedValueCents, locale) })}</p>
          {invite.paymentMethod === null ? null : <MethodLine method={invite.paymentMethod} />}
        </div>
      )}

      {error === null ? null : <ErrorAlert error={error} />}

      {pending && panel === null ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button icon={<CheckCircle2 aria-hidden="true" className="size-5" />} onClick={() => void act("accept", {}, t("toast.accepted"))} pending={busy} size="primary" variant="primary">
            {t("accept")}
          </Button>
          <Button icon={<Handshake aria-hidden="true" className="size-5" />} onClick={() => setPanel("counter")} size="primary">
            {t("counter")}
          </Button>
          <Button icon={<XCircle aria-hidden="true" className="size-5" />} onClick={() => setPanel("decline")} size="primary" variant="ghost">
            {t("decline")}
          </Button>
        </div>
      ) : null}
      {invite.status === "COUNTERED" && panel === null ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button icon={<CheckCircle2 aria-hidden="true" className="size-5" />} onClick={() => void act("accept", {}, t("toast.accepted"))} pending={busy} size="primary" variant="primary">
            {t("accept")}
          </Button>
          <Button icon={<XCircle aria-hidden="true" className="size-5" />} onClick={() => setPanel("decline")} size="primary" variant="ghost">
            {t("decline")}
          </Button>
        </div>
      ) : null}
      {invite.status === "ACCEPTED" && panel === null ? (
        <div>
          <Button icon={<CheckCircle2 aria-hidden="true" className="size-5" />} onClick={() => setPanel("complete")} size="primary" variant="primary">
            {t("complete")}
          </Button>
        </div>
      ) : null}

      {panel === "decline" ? (
        <TextForm busy={busy} label={t("declineReason")} onCancel={() => setPanel(null)} onSubmit={(reason) => void act("decline", { reason }, t("toast.declined"))} optional submitLabel={t("declineSubmit")} />
      ) : null}
      {panel === "complete" ? (
        <TextForm busy={busy} label={t("completeNote")} onCancel={() => setPanel(null)} onSubmit={(note) => void act("complete", { note }, t("toast.completed"))} requiredMessage={t("completeRequired")} submitLabel={t("completeSubmit")} />
      ) : null}
      {panel === "counter" ? <CounterForm busy={busy} onCancel={() => setPanel(null)} onSubmit={(body) => void act("counter", body, t("toast.countered"))} /> : null}

      {engaged ? (
        <section className="flex flex-col gap-3 border-t border-[var(--ar-border)] pt-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Wallet aria-hidden="true" className="size-5" />
            {all("payment.title")}
          </h2>
          <PaymentConfirmations customerPaidAt={invite.customerPaidAt} providerPaidAt={invite.providerPaidAt} />
          {invite.providerPaidAt === null && invite.agreedValueCents !== null ? (
            <div>
              <Button icon={<Wallet aria-hidden="true" className="size-5" />} onClick={() => void act("paid", {}, t("toast.paid"))} pending={busy}>
                {all("payment.markProvider")}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {review === null ? null : (
        <section className="flex flex-col gap-3 border-t border-[var(--ar-border)] pt-4">
          <h2 className="font-semibold">{all("review.title")}</h2>
          <ReviewSummary review={review}>
            {review.threadStatus === "OPEN" && review.providerReply === null && panel === null ? (
              <div>
                <Button icon={<Send aria-hidden="true" className="size-4" />} onClick={() => setPanel("reply")} variant="primary">
                  {all("review.reply")}
                </Button>
              </div>
            ) : null}
            {panel === "reply" ? <ReplyForm busy={busy} onCancel={() => setPanel(null)} onSubmit={(body) => void act("review-reply", { body }, t("toast.replied"))} /> : null}
            {review.reportedBy.includes("PROVIDER") || panel !== null ? null : (
              <div>
                <Button icon={<Flag aria-hidden="true" className="size-4" />} onClick={() => setPanel("report")} variant="ghost">
                  {all("review.report")}
                </Button>
              </div>
            )}
            {panel === "report" ? <ReportForm busy={busy} onCancel={() => setPanel(null)} onSubmit={(reason) => void act("review-report", { reason }, t("toast.reported"))} /> : null}
          </ReviewSummary>
        </section>
      )}

      {invite.status === "COMPLETED" ? (
        <aside className="flex flex-col gap-2 rounded-cards border-2 border-[var(--ar-primary)] bg-[var(--ar-primary-bg)] p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Sparkles aria-hidden="true" className="size-5" />
            {t("cta.title")}
          </h2>
          <p>{t("cta.body")}</p>
          <a className={buttonVariants({ variant: "primary", size: "primary" })} href={signupUrl}>
            {t("cta.action")}
          </a>
        </aside>
      ) : null}
    </article>
  );
}

const ANSWERED = { ACCEPTED: true, DECLINED: true, COUNTERED: true, COMPLETED: true } as const;

function MethodLine({ method }: { readonly method: string }): ReactElement {
  const t = useTranslations("providers");
  return <p className="text-sm">{t("link.method", { method: t(`agreement.methods.${method}`) })}</p>;
}

function TextForm({ label, submitLabel, busy, optional = false, requiredMessage, onSubmit, onCancel }: { readonly label: string; readonly submitLabel: string; readonly busy: boolean; readonly optional?: boolean; readonly requiredMessage?: string; readonly onSubmit: (value: string | null) => void; readonly onCancel: () => void }): ReactElement {
  const t = useTranslations("providers.link");
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);
  const empty = value.trim().length === 0;
  return (
    <form
      className="flex flex-col gap-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (!optional && empty) return;
        onSubmit(empty ? null : value.trim());
      }}
    >
      <Field error={touched && !optional && empty ? requiredMessage : undefined} label={label} required={!optional}>
        {(props) => <Textarea {...props} className="min-h-24 py-2" maxLength={2000} onChange={(event) => setValue(event.target.value)} value={value} />}
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button icon={<Send aria-hidden="true" className="size-4" />} pending={busy} size="primary" type="submit" variant="primary">
          {submitLabel}
        </Button>
        <Button disabled={busy} onClick={onCancel} size="primary" variant="ghost">
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}

function CounterForm({ busy, onSubmit, onCancel }: { readonly busy: boolean; readonly onSubmit: (body: Record<string, unknown>) => void; readonly onCancel: () => void }): ReactElement {
  const t = useTranslations("providers.link");
  const [cents, setCents] = useState<number | null>(null);
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const missing = cents === null && date.length === 0;
  return (
    <form
      className="flex flex-col gap-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (missing) return;
        onSubmit({ priceCents: cents, date: date.length === 0 ? null : date, note: note.trim().length === 0 ? null : note.trim() });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field error={touched && missing ? t("counterRequired") : undefined} label={t("counterPrice")}>
          {(props) => <MoneyInput {...props} cents={cents} onChange={setCents} />}
        </Field>
        <Field label={t("counterDate")}>{(props) => <Input {...props} onChange={(event) => setDate(event.target.value)} type="date" value={date} />}</Field>
      </div>
      <Field label={t("counterNote")}>{(props) => <Textarea {...props} className="min-h-20 py-2" maxLength={500} onChange={(event) => setNote(event.target.value)} value={note} />}</Field>
      <div className="flex flex-wrap gap-2">
        <Button icon={<Send aria-hidden="true" className="size-4" />} pending={busy} size="primary" type="submit" variant="primary">
          {t("counterSubmit")}
        </Button>
        <Button disabled={busy} onClick={onCancel} size="primary" variant="ghost">
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}

function ReplyForm({ busy, onSubmit, onCancel }: { readonly busy: boolean; readonly onSubmit: (body: string) => void; readonly onCancel: () => void }): ReactElement {
  const t = useTranslations("providers.review");
  return <TextForm busy={busy} label={t("replyLabel")} onCancel={onCancel} onSubmit={(value) => (value === null ? undefined : onSubmit(value))} requiredMessage={t("replyRequired")} submitLabel={t("reply")} />;
}

function ReportForm({ busy, onSubmit, onCancel }: { readonly busy: boolean; readonly onSubmit: (reason: string | null) => void; readonly onCancel: () => void }): ReactElement {
  const t = useTranslations("providers.review");
  return <TextForm busy={busy} label={t("reportReason")} onCancel={onCancel} onSubmit={onSubmit} optional submitLabel={t("reportSubmit")} />;
}
