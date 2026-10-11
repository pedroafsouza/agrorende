"use client";

import { ProviderPaymentMethodEnum, type ProviderInviteDTO, type ProviderInviteIssuedDTO, type ProviderPaymentMethod, type ProviderReviewDTO } from "@agrorende/contracts";
import { Ban, CheckCircle2, Flag, Handshake, Link2, Save, Send, Star, Wallet } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState, type ReactElement, type ReactNode } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/forms/ConfirmDialog";
import { MoneyInput } from "@/components/forms/MoneyInput";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { Button } from "@/components/ui/Button";
import { Field, Select, Textarea } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { useSave } from "@/lib/useSave";

import { InviteStatusBadge, PaymentConfirmations, ReviewSummary, ScoreInput } from "./shared";

function Block({ title, icon, children }: { readonly title: string; readonly icon: ReactNode; readonly children: ReactNode }): ReactElement {
  return (
    <div className="flex flex-col gap-3 border-t border-[var(--ar-border)] pt-3">
      <h4 className="flex items-center gap-2 font-semibold">
        {icon}
        {title}
      </h4>
      {children}
    </div>
  );
}

/** One external-provider engagement on the work order page: status, links, agreement, payment and review (#63–#66). */
export function InviteCard({ invite, onIssued }: { readonly invite: ProviderInviteDTO; readonly onIssued: (issued: ProviderInviteIssuedDTO | null) => void }): ReactElement {
  const t = useTranslations("providers.invite");
  const client = useQueryClient();
  const toasts = useTranslations("providers.toast");
  const locale = useLocale();
  const base = `/work-orders/${invite.workOrderId}/provider-invites/${invite.id}`;
  const [confirm, setConfirm] = useState<"reissue" | "revoke" | null>(null);
  const [acceptCounter, counterState] = useSave("work-orders", () => api<ProviderInviteDTO>(`${base}/accept-counter`, { method: "POST" }), () => toast.success(toasts("counterAccepted")));
  const pending = invite.status === "SENT" || invite.status === "OPENED" || invite.status === "COUNTERED";
  const canReissue = invite.status !== "REVOKED" && invite.status !== "DECLINED";
  const canRevoke = invite.status !== "REVOKED" && invite.status !== "DECLINED" && invite.status !== "COMPLETED";
  const engaged = invite.status === "ACCEPTED" || invite.status === "COMPLETED";
  const agreementOpen = invite.status !== "REVOKED" && invite.status !== "DECLINED" && invite.status !== "EXPIRED";

  return (
    <article className="flex flex-col gap-3 rounded-cards border border-[var(--ar-border-strong)] bg-[var(--ar-surface)] p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase text-[var(--ar-text-muted)]">{t("title")}</p>
          <h3 className="text-lg font-semibold">{invite.providerName}</h3>
          <p className="text-sm text-[var(--ar-text-muted)]">
            {t("contact")}: {[invite.phone, invite.email].filter((value): value is string => value !== null).join(" · ")}
          </p>
          <p className="text-sm text-[var(--ar-text-muted)]">
            {t("sentAt", { date: formatDateTime(invite.createdAt, locale) })}
            {pending ? ` · ${t("expiresAt", { date: formatDateTime(invite.expiresAt, locale) })}` : ""}
          </p>
        </div>
        <InviteStatusBadge status={invite.status} />
      </header>
      {invite.message === null ? null : <p className="whitespace-pre-wrap break-words rounded-controls bg-[var(--ar-surface-muted)] p-3 text-sm">{invite.message}</p>}
      {invite.status === "DECLINED" && invite.declineReason !== null ? <p className="text-sm">{t("declineReason", { reason: invite.declineReason })}</p> : null}

      {invite.status === "COUNTERED" ? (
        <Block icon={<Handshake aria-hidden="true" className="size-5" />} title={t("counter.title")}>
          {invite.proposedPriceCents === null ? null : <p>{t("counter.price", { price: formatMoney(invite.proposedPriceCents, locale) })}</p>}
          {invite.proposedDate === null ? null : <p>{t("counter.date", { date: formatDate(invite.proposedDate, locale) })}</p>}
          {invite.proposalNote === null ? null : <p className="whitespace-pre-wrap">{t("counter.note", { note: invite.proposalNote })}</p>}
          {counterState.error === null ? null : <ErrorAlert error={counterState.error} onRetry={() => void acceptCounter()} />}
          <div>
            <Button icon={<CheckCircle2 aria-hidden="true" className="size-4" />} onClick={() => void acceptCounter()} pending={counterState.busy} variant="primary">
              {t("counter.accept")}
            </Button>
          </div>
        </Block>
      ) : null}

      {invite.status === "COMPLETED" && invite.completedAt !== null ? (
        <Block icon={<CheckCircle2 aria-hidden="true" className="size-5" />} title={t("completion.title")}>
          <p className="text-sm text-[var(--ar-text-muted)]">{t("completion.at", { date: formatDateTime(invite.completedAt, locale) })}</p>
          {invite.completionNote === null ? null : <p className="whitespace-pre-wrap break-words">{invite.completionNote}</p>}
        </Block>
      ) : null}

      {agreementOpen ? <AgreementBlock base={base} invite={invite} /> : null}
      {engaged ? <PaymentBlock base={base} invite={invite} /> : null}
      {invite.status === "COMPLETED" ? <ReviewBlock invite={invite} /> : null}

      {canReissue || canRevoke ? (
        <div className="flex flex-wrap gap-2 border-t border-[var(--ar-border)] pt-3">
          {canReissue ? (
            <Button icon={<Link2 aria-hidden="true" className="size-4" />} onClick={() => setConfirm("reissue")}>
              {t("reissue")}
            </Button>
          ) : null}
          {canRevoke ? (
            <Button icon={<Ban aria-hidden="true" className="size-4" />} onClick={() => setConfirm("revoke")} variant="ghost">
              {t("revoke")}
            </Button>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        body={t("reissueConfirmBody")}
        confirmLabel={t("reissue")}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          const issued = await api<ProviderInviteIssuedDTO>(`${base}/reissue`, { method: "POST" });
          await client.invalidateQueries({ queryKey: ["work-orders"] });
          toast.success(toasts("reissued"));
          onIssued(issued);
        }}
        open={confirm === "reissue"}
        title={t("reissueConfirmTitle")}
        tone="primary"
      />
      <ConfirmDialog
        body={t("revokeConfirmBody")}
        confirmLabel={t("revoke")}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          await api<ProviderInviteDTO>(`${base}/revoke`, { method: "POST" });
          await client.invalidateQueries({ queryKey: ["work-orders"] });
          toast.success(toasts("revoked"));
          onIssued(null);
        }}
        open={confirm === "revoke"}
        title={t("revokeConfirmTitle")}
      />
    </article>
  );
}

function AgreementBlock({ invite, base }: { readonly invite: ProviderInviteDTO; readonly base: string }): ReactElement {
  const t = useTranslations("providers.agreement");
  const locale = useLocale();
  const locked = invite.customerPaidAt !== null || invite.providerPaidAt !== null;
  const [cents, setCents] = useState<number | null>(invite.agreedValueCents);
  const [method, setMethod] = useState<ProviderPaymentMethod | "">(invite.paymentMethod ?? "");
  const [save, state] = useSave("work-orders", () => api<ProviderInviteDTO>(`${base}/agreement`, { method: "PATCH", body: { agreedValueCents: cents, paymentMethod: method === "" ? null : method } }), () => toast.success(t("saved")));
  const dirty = cents !== invite.agreedValueCents || method !== (invite.paymentMethod ?? "");
  return (
    <Block icon={<Wallet aria-hidden="true" className="size-5" />} title={t("title")}>
      <p className="text-sm text-[var(--ar-text-muted)]">{t("notice")}</p>
      {locked ? (
        <>
          <p className="font-semibold">{invite.agreedValueCents === null ? t("none") : formatMoney(invite.agreedValueCents, locale)}</p>
          <p className="text-sm">{invite.paymentMethod === null ? t("methodNone") : t(`methods.${invite.paymentMethod}`)}</p>
          <p className="text-sm text-[var(--ar-text-muted)]">{t("locked")}</p>
        </>
      ) : (
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Field label={t("value")}>{(props) => <MoneyInput {...props} cents={cents} onChange={setCents} />}</Field>
          <Field label={t("method")}>
            {(props) => (
              <Select {...props} onChange={(event) => setMethod(event.target.value as ProviderPaymentMethod | "")} value={method}>
                <option value="">{t("methodNone")}</option>
                {ProviderPaymentMethodEnum.options.map((value) => (
                  <option key={value} value={value}>
                    {t(`methods.${value}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Button disabled={!dirty} icon={<Save aria-hidden="true" className="size-4" />} pending={state.busy} type="submit">
            {t("save")}
          </Button>
        </form>
      )}
      {state.error === null ? null : <ErrorAlert error={state.error} onRetry={() => void save()} />}
    </Block>
  );
}

function PaymentBlock({ invite, base }: { readonly invite: ProviderInviteDTO; readonly base: string }): ReactElement {
  const t = useTranslations("providers.payment");
  const toasts = useTranslations("providers.toast");
  const [markPaid, state] = useSave("work-orders", () => api<ProviderInviteDTO>(`${base}/paid`, { method: "POST" }), () => toast.success(toasts("paid")));
  return (
    <Block icon={<CheckCircle2 aria-hidden="true" className="size-5" />} title={t("title")}>
      <PaymentConfirmations customerPaidAt={invite.customerPaidAt} providerPaidAt={invite.providerPaidAt} />
      {invite.customerPaidAt === null ? (
        invite.agreedValueCents === null ? (
          <p className="text-sm text-[var(--ar-text-muted)]">{t("needsAgreement")}</p>
        ) : (
          <div>
            <Button icon={<Wallet aria-hidden="true" className="size-4" />} onClick={() => void markPaid()} pending={state.busy} variant="primary">
              {t("markCustomer")}
            </Button>
          </div>
        )
      ) : null}
      {state.error === null ? null : <ErrorAlert error={state.error} onRetry={() => void markPaid()} />}
    </Block>
  );
}

const CRITERIA = ["punctuality", "quality", "price", "communication"] as const;

function ReviewBlock({ invite }: { readonly invite: ProviderInviteDTO }): ReactElement {
  const t = useTranslations("providers.review");
  const toasts = useTranslations("providers.toast");
  const client = useQueryClient();
  const review = invite.review;
  const reviewBase = `/work-orders/${invite.workOrderId}/provider-reviews/${review?.id ?? ""}`;
  const [reply, setReply] = useState("");
  const [reporting, setReporting] = useState(false);
  const [sendReply, replyState] = useSave("work-orders", (body: string) => api<ProviderReviewDTO>(`${reviewBase}/reply`, { method: "POST", body: { body } }), () => {
    setReply("");
    toast.success(toasts("replied"));
  });
  if (review === null) return <ReviewForm invite={invite} />;
  const canReply = review.threadStatus === "OPEN" && review.providerReply !== null && review.customerReply === null;
  return (
    <Block icon={<Star aria-hidden="true" className="size-5" />} title={t("title")}>
      <ReviewSummary review={review}>
        {review.threadStatus === "OPEN" && review.providerReply === null ? <p className="text-sm text-[var(--ar-text-muted)]">{t("awaitingProvider")}</p> : null}
        {canReply ? (
          <form
            className="flex flex-col gap-2"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (reply.trim().length > 0) void sendReply(reply.trim());
            }}
          >
            <Field label={t("replyLabel")}>{(props) => <Textarea {...props} className="min-h-20 py-2" maxLength={2000} onChange={(event) => setReply(event.target.value)} value={reply} />}</Field>
            {replyState.error === null ? null : <ErrorAlert error={replyState.error} />}
            <div>
              <Button disabled={reply.trim().length === 0} icon={<Send aria-hidden="true" className="size-4" />} pending={replyState.busy} type="submit" variant="primary">
                {t("finalReply")}
              </Button>
            </div>
          </form>
        ) : null}
        {review.reportedBy.includes("CUSTOMER") ? null : (
          <div>
            <Button icon={<Flag aria-hidden="true" className="size-4" />} onClick={() => setReporting(true)} variant="ghost">
              {t("report")}
            </Button>
          </div>
        )}
      </ReviewSummary>
      <ConfirmDialog
        body={t("reportReason")}
        confirmLabel={t("reportSubmit")}
        onClose={() => setReporting(false)}
        onConfirm={async () => {
          await api<ProviderReviewDTO>(`${reviewBase}/report`, { method: "POST", body: {} });
          await client.invalidateQueries({ queryKey: ["work-orders"] });
          toast.success(toasts("reported"));
        }}
        open={reporting}
        title={t("report")}
      />
    </Block>
  );
}

function ReviewForm({ invite }: { readonly invite: ProviderInviteDTO }): ReactElement {
  const t = useTranslations("providers.review");
  const toasts = useTranslations("providers.toast");
  const [rating, setRating] = useState(0);
  const [criteria, setCriteria] = useState<Record<(typeof CRITERIA)[number], number>>({ punctuality: 0, quality: 0, price: 0, communication: 0 });
  const [comment, setComment] = useState("");
  const [submit, state] = useSave(
    "work-orders",
    () => api<ProviderReviewDTO>(`/work-orders/${invite.workOrderId}/provider-invites/${invite.id}/review`, { method: "POST", body: { rating, criteria, comment: comment.trim().length === 0 ? null : comment.trim() } }),
    () => toast.success(toasts("reviewed")),
  );
  const ready = rating > 0 && CRITERIA.every((key) => criteria[key] > 0);
  return (
    <Block icon={<Star aria-hidden="true" className="size-5" />} title={t("form.title")}>
      <form
        className="flex flex-col gap-3"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) void submit();
        }}
      >
        <ScoreInput label={t("form.rating")} name="rating" onChange={setRating} value={rating} />
        <p className="text-sm font-semibold">{t("form.criteria")}</p>
        <div className="grid gap-3 lg:grid-cols-2">
          {CRITERIA.map((key) => (
            <ScoreInput key={key} label={t(`criteria.${key}`)} name={key} onChange={(value) => setCriteria({ ...criteria, [key]: value })} value={criteria[key]} />
          ))}
        </div>
        <Field label={t("form.comment")}>{(props) => <Textarea {...props} className="min-h-20 py-2" maxLength={2000} onChange={(event) => setComment(event.target.value)} value={comment} />}</Field>
        {state.error === null ? null : <ErrorAlert error={state.error} onRetry={() => void submit()} />}
        <div>
          <Button disabled={!ready} icon={<Send aria-hidden="true" className="size-4" />} pending={state.busy} type="submit" variant="primary">
            {t("form.submit")}
          </Button>
        </div>
      </form>
    </Block>
  );
}
