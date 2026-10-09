"use client";

import { useQueryClient } from "@tanstack/react-query";
import { FilePlus2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { EntityPicker } from "@/components/forms/EntityPicker";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Textarea } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { useFieldErrors } from "@/lib/forms";

import { LinesEditor, newLine } from "./LinesEditor";
import { linesBody, type BillingDocumentDTO, type BillingLineDTO, type LineDraft } from "./types";

export type CreateSource = { readonly workOrderId: string } | { readonly rentalId: string } | null;

export function toDrafts(lines: readonly BillingLineDTO[]): LineDraft[] {
  return lines.length === 0 ? [newLine()] : lines.map((line) => newLine({ description: line.description, quantity: String(line.quantity), unitAmountCents: line.unitAmountCents }));
}

/**
 * Create a DRAFT billing document. With a source the lines arrive prefilled from the work order or
 * rental; when the source has no customer the picker is required (ERP-08). The client id makes a
 * retried create return the same document instead of a second one.
 */
export function BillingCreateDialog({ source, prefill, onClose, onCreated }: { readonly source: CreateSource; readonly prefill: { readonly lines: readonly BillingLineDTO[]; readonly customerId: string | null } | null; readonly onClose: () => void; readonly onCreated: (doc: BillingDocumentDTO) => void }) {
  const t = useTranslations("billing");
  const common = useTranslations("common");
  const client = useQueryClient();
  const fieldErrorsOf = useFieldErrors();
  const id = useRef(crypto.randomUUID());
  const [customerId, setCustomerId] = useState<string | null>(prefill?.customerId ?? null);
  const [lines, setLines] = useState<LineDraft[]>(() => toDrafts(prefill?.lines ?? []));
  const [discountCents, setDiscount] = useState(0);
  const [notes, setNotes] = useState("");
  const [invalid, setInvalid] = useState<number[]>([]);
  const [customerMissing, setCustomerMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const server = fieldErrorsOf(error);
  const needsCustomer = prefill?.customerId === null || prefill === null;
  const submit = async () => {
    const body = linesBody(lines);
    setInvalid(body.invalid);
    setCustomerMissing(customerId === null);
    if (body.invalid.length > 0 || customerId === null) return;
    setBusy(true);
    setError(null);
    try {
      const sourceBody = source === null ? { source: "MANUAL" } : "workOrderId" in source ? { source: "WORK_ORDER", workOrderId: source.workOrderId } : { source: "RENTAL", rentalId: source.rentalId };
      const notesText = notes.trim();
      const doc = await api<BillingDocumentDTO>("/billing-documents", {
        method: "POST",
        body: { id: id.current, ...sourceBody, customerId, lines: body.lines, discountCents, ...(notesText.length > 0 ? { notes: notesText } : {}) },
      });
      await client.invalidateQueries({ queryKey: ["billing"] });
      onCreated(doc);
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
          <Button busy={busy} icon={<FilePlus2 aria-hidden="true" className="size-4" />} onClick={() => void submit()} variant="primary">
            {t("create.confirm")}
          </Button>
        </>
      }
      onClose={onClose}
      open
      size="lg"
      title={t("create.title")}
    >
      <div className="flex flex-col gap-4">
        <p>{source === null ? t("create.manualBody") : t("create.sourceBody")}</p>
        {error === null || server.customerId !== undefined ? null : <ErrorAlert error={error} onRetry={() => void submit()} />}
        {needsCustomer || customerMissing || server.customerId !== undefined ? (
          <Field error={customerMissing ? t("create.customerRequired") : server.customerId} hint={source === null ? undefined : t("create.customerHint")} label={t("fields.customer")} required>
            {(p) => (
              <EntityPicker
                {...p}
                entity="customers"
                onChange={(next) => {
                  setCustomerId(next);
                  setCustomerMissing(false);
                }}
                value={customerId}
              />
            )}
          </Field>
        ) : null}
        <LinesEditor discountCents={discountCents} invalid={invalid} lines={lines} onChange={setLines} onDiscount={setDiscount} />
        <Field error={server.notes} label={t("fields.notes")}>
          {(p) => <Textarea {...p} maxLength={2000} onChange={(e) => setNotes(e.target.value)} rows={2} value={notes} />}
        </Field>
      </div>
    </Dialog>
  );
}
