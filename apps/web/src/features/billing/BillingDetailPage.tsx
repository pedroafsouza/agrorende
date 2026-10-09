"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, FileCheck2, FileText, Pencil, XCircle } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Detail } from "@/components/data/Detail";
import { LoadingState } from "@/components/data/States";
import { ConfirmDialog } from "@/components/forms/ConfirmDialog";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { useFieldErrors } from "@/lib/forms";

import { toDrafts } from "./BillingCreateDialog";
import { BillingStatusBadge } from "./BillingStatusBadge";
import { LinesEditor } from "./LinesEditor";
import { billingActions, issueBody, linesBody, normaliseNfeKey, sourceHref, type BillingDocumentDTO, type LineDraft } from "./types";

type Open = "edit" | "issue" | "pay" | "cancel" | null;

/** One billing document: lines, totals, NF-e reference, PDF and the DRAFT → ISSUED → PAID actions (ERP-08). */
export function BillingDetailPage({ id }: { readonly id: string }) {
  const t = useTranslations("billing");
  const locale = useLocale();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["billing", id], queryFn: () => api<BillingDocumentDTO>(`/billing-documents/${id}`) });
  const [open, setOpen] = useState<Open>(null);
  if (query.isLoading) return <LoadingState />;
  if (query.error !== null || query.data === undefined) return <ErrorAlert error={query.error} onRetry={() => void query.refetch()} />;
  const doc = query.data;
  const actions = billingActions(doc.status);
  const href = sourceHref(doc);
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ["billing"] });
  };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <>
            <a className={buttonVariants({ variant: "secondary" })} href={`/api/v1/billing-documents/${id}/pdf`} rel="noopener" target="_blank">
              <FileText aria-hidden="true" className="size-4" />
              {t("actions.pdf")}
            </a>
            {actions.edit ? (
              <Button icon={<Pencil aria-hidden="true" className="size-4" />} onClick={() => setOpen("edit")}>
                {t("actions.edit")}
              </Button>
            ) : null}
            {actions.issue ? (
              <Button icon={<FileCheck2 aria-hidden="true" className="size-4" />} onClick={() => setOpen("issue")} variant="primary">
                {t("actions.issue")}
              </Button>
            ) : null}
            {actions.pay ? (
              <Button icon={<Banknote aria-hidden="true" className="size-4" />} onClick={() => setOpen("pay")} variant="primary">
                {t("actions.pay")}
              </Button>
            ) : null}
            {actions.cancel ? (
              <Button icon={<XCircle aria-hidden="true" className="size-4" />} onClick={() => setOpen("cancel")} variant="danger">
                {t("actions.cancel")}
              </Button>
            ) : null}
          </>
        }
        back={{ href: "/billing", label: t("list.title") }}
        subtitle={<BillingStatusBadge status={doc.status} />}
        title={t("detail.title", { number: doc.number })}
      />
      <section className="rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4">
        <h2 className="mb-3 text-lg font-semibold">{t("detail.summary")}</h2>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Detail label={t("fields.customer")} value={<Link className="font-semibold text-[var(--ar-link)]" href={`/customers/${doc.customerId}`}>{doc.customerName ?? "—"}</Link>} />
          <Detail
            label={t("fields.source")}
            value={href === null ? t(`source.${doc.source}`) : <Link className="font-semibold text-[var(--ar-link)]" href={href}>{`${t(`source.${doc.source}`)} ${doc.sourceNumber ?? ""}`.trim()}</Link>}
          />
          <Detail label={t("fields.issuedAt")} value={doc.issuedAt === null ? null : formatDateTime(doc.issuedAt, locale)} />
          <Detail label={t("fields.dueAt")} value={doc.dueAt === null ? null : formatDateTime(doc.dueAt, locale)} />
          <Detail label={t("fields.paidAt")} value={doc.paidAt === null ? null : formatDateTime(doc.paidAt, locale)} />
          <Detail label={t("fields.nfeNumber")} value={doc.nfeNumber} />
          <Detail label={t("fields.nfeKey")} value={doc.nfeKey === null ? null : <span className="break-all font-mono text-sm">{doc.nfeKey}</span>} />
          {doc.notes === null ? null : <Detail label={t("fields.notes")} value={<span className="whitespace-pre-line">{doc.notes}</span>} />}
        </dl>
      </section>
      <section className="rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4">
        <h2 className="mb-3 text-lg font-semibold">{t("lines.title")}</h2>
        <table className="w-full text-left">
          <caption className="sr-only">{t("lines.title")}</caption>
          <thead>
            <tr className="border-b border-[var(--ar-border)] text-sm text-[var(--ar-text-muted)]">
              <th className="py-2" scope="col">{t("lines.description")}</th>
              <th className="py-2 text-right" scope="col">{t("lines.quantity")}</th>
              <th className="py-2 text-right" scope="col">{t("lines.unitAmount")}</th>
              <th className="py-2 text-right" scope="col">{t("lines.amount")}</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((line, index) => (
              <tr className="border-b border-[var(--ar-border)]" key={`${index}-${line.description}`}>
                <td className="py-2">{line.description}</td>
                <td className="py-2 text-right">{formatNumber(line.quantity, locale, 2)}</td>
                <td className="py-2 text-right">{formatMoney(line.unitAmountCents, locale)}</td>
                <td className="py-2 text-right font-semibold">{formatMoney(line.amountCents, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="mt-3 ml-auto grid max-w-xs grid-cols-2 gap-1 text-right">
          <dt className="text-[var(--ar-text-muted)]">{t("fields.subtotal")}</dt>
          <dd>{formatMoney(doc.subtotalCents, locale)}</dd>
          <dt className="text-[var(--ar-text-muted)]">{t("fields.discount")}</dt>
          <dd>{doc.discountCents === 0 ? "—" : `− ${formatMoney(doc.discountCents, locale)}`}</dd>
          <dt className="font-semibold">{t("fields.total")}</dt>
          <dd className="text-lg font-bold">{formatMoney(doc.totalCents, locale)}</dd>
        </dl>
      </section>
      {open === "edit" ? <EditDraftDialog doc={doc} onClose={() => setOpen(null)} onDone={refresh} /> : null}
      {open === "issue" ? <IssueDialog doc={doc} onClose={() => setOpen(null)} onDone={refresh} /> : null}
      <ConfirmDialog
        body={t("pay.body", { total: formatMoney(doc.totalCents, locale) })}
        confirmLabel={t("actions.pay")}
        onClose={() => setOpen(null)}
        onConfirm={async () => {
          await api<BillingDocumentDTO>(`/billing-documents/${id}/pay`, { method: "POST", body: {} });
          await refresh();
          toast.success(t("toast.paid"));
        }}
        open={open === "pay"}
        title={t("pay.title")}
        tone="primary"
      />
      <ConfirmDialog
        body={t("cancel.body")}
        confirmLabel={t("actions.cancel")}
        onClose={() => setOpen(null)}
        onConfirm={async (reason) => {
          await api<BillingDocumentDTO>(`/billing-documents/${id}/cancel`, { method: "POST", body: { reason } });
          await refresh();
          toast.success(t("toast.cancelled"));
        }}
        open={open === "cancel"}
        reasonLabel={t("cancel.reason")}
        title={t("cancel.title")}
      />
    </div>
  );
}

function IssueDialog({ doc, onClose, onDone }: { readonly doc: BillingDocumentDTO; readonly onClose: () => void; readonly onDone: () => Promise<void> }) {
  const t = useTranslations("billing");
  const common = useTranslations("common");
  const fieldErrorsOf = useFieldErrors();
  const [values, setValues] = useState({ dueAt: "", nfeNumber: doc.nfeNumber ?? "", nfeKey: doc.nfeKey ?? "" });
  const [keyInvalid, setKeyInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const server = fieldErrorsOf(error);
  const submit = async () => {
    const key = normaliseNfeKey(values.nfeKey);
    setKeyInvalid(!key.valid);
    if (!key.valid) return;
    setBusy(true);
    setError(null);
    try {
      await api<BillingDocumentDTO>(`/billing-documents/${doc.id}/issue`, { method: "POST", body: issueBody(values) });
      await onDone();
      toast.success(t("toast.issued"));
      onClose();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      closeLabel={common("actions.cancel")}
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose}>{common("actions.cancel")}</Button>
          <Button busy={busy} icon={<FileCheck2 aria-hidden="true" className="size-4" />} onClick={() => void submit()} variant="primary">
            {t("actions.issue")}
          </Button>
        </>
      }
      onClose={onClose}
      open
      title={t("issue.title")}
    >
      <div className="flex flex-col gap-4">
        <p>{t("issue.body")}</p>
        {error === null || server.nfeKey !== undefined || server.nfeNumber !== undefined ? null : <ErrorAlert error={error} onRetry={() => void submit()} />}
        <Field label={t("fields.dueAt")}>{(p) => <Input {...p} onChange={(e) => setValues({ ...values, dueAt: e.target.value })} type="date" value={values.dueAt} />}</Field>
        <Field error={server.nfeNumber} hint={t("issue.nfeHint")} label={t("fields.nfeNumber")}>
          {(p) => <Input {...p} maxLength={20} onChange={(e) => setValues({ ...values, nfeNumber: e.target.value })} value={values.nfeNumber} />}
        </Field>
        <Field error={keyInvalid ? t("issue.nfeKeyInvalid") : server.nfeKey} label={t("fields.nfeKey")}>
          {(p) => (
            <Input
              {...p}
              inputMode="numeric"
              maxLength={60}
              onChange={(e) => {
                setValues({ ...values, nfeKey: e.target.value });
                setKeyInvalid(false);
              }}
              value={values.nfeKey}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

function EditDraftDialog({ doc, onClose, onDone }: { readonly doc: BillingDocumentDTO; readonly onClose: () => void; readonly onDone: () => Promise<void> }) {
  const t = useTranslations("billing");
  const common = useTranslations("common");
  const [lines, setLines] = useState<LineDraft[]>(() => toDrafts(doc.lines));
  const [discountCents, setDiscount] = useState(doc.discountCents);
  const [notes, setNotes] = useState(doc.notes ?? "");
  const [invalid, setInvalid] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const submit = async () => {
    const body = linesBody(lines);
    setInvalid(body.invalid);
    if (body.invalid.length > 0 || body.lines.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const notesText = notes.trim();
      await api<BillingDocumentDTO>(`/billing-documents/${doc.id}`, { method: "PATCH", body: { lines: body.lines, discountCents, notes: notesText.length > 0 ? notesText : null }, version: doc.syncVersion });
      await onDone();
      toast.success(t("toast.updated"));
      onClose();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      closeLabel={common("actions.cancel")}
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose}>{common("actions.cancel")}</Button>
          <Button busy={busy} onClick={() => void submit()} variant="primary">
            {common("actions.save")}
          </Button>
        </>
      }
      onClose={onClose}
      open
      size="lg"
      title={t("edit.title")}
    >
      <div className="flex flex-col gap-4">
        {error === null ? null : <ErrorAlert error={error} onRetry={() => void onDone()} />}
        <LinesEditor discountCents={discountCents} invalid={invalid} lines={lines} onChange={setLines} onDiscount={setDiscount} />
        <Field label={t("fields.notes")}>{(p) => <Textarea {...p} maxLength={2000} onChange={(e) => setNotes(e.target.value)} rows={2} value={notes} />}</Field>
      </div>
    </Dialog>
  );
}
