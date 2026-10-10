"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ReceiptText, RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Textarea } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";

import { chargesUpdatedOf, closeBody, heldDamagesOf, isBillingFailure, type RentalDTO, type UpdatedTotals } from "./types";

/**
 * Close with a payment note (RN-09). The dialog sends the charges version the user saw;
 * RENTAL_CHARGES_UPDATED (EC-RN-05) shows the new totals and asks for a second confirmation.
 */
export function CloseRentalDialog({ rentalId, open, totals, onClose, onDone }: { readonly rentalId: string; readonly open: boolean; readonly totals: UpdatedTotals; readonly onClose: () => void; readonly onDone: () => void }) {
  const t = useTranslations("rentals");
  const common = useTranslations("common");
  const errors = useTranslations("errors");
  const locale = useLocale();
  const client = useQueryClient();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [updated, setUpdated] = useState<UpdatedTotals | null>(null);
  const shown = updated ?? totals;
  const held = heldDamagesOf(error);
  const billingFailed = isBillingFailure(error);
  const close = () => {
    setError(null);
    setUpdated(null);
    onClose();
  };
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api<RentalDTO>(`/rentals/${rentalId}/close`, { method: "POST", body: closeBody(note, shown.chargesVersion) });
      await client.invalidateQueries({ queryKey: ["rentals"] });
      setUpdated(null);
      onDone();
    } catch (caught) {
      const fresh = chargesUpdatedOf(caught);
      if (fresh === null) setError(caught);
      else {
        setUpdated(fresh);
        await client.invalidateQueries({ queryKey: ["rentals"] });
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      closeLabel={common("actions.cancel")}
      footer={
        <>
          <Button onClick={close}>{billingFailed ? t("close.billingLeave") : common("actions.cancel")}</Button>
          <Button pending={busy} onClick={() => void submit()} variant="primary">
            {billingFailed ? t("close.billingRetry") : updated === null ? t("close.confirm") : t("close.confirmUpdated")}
          </Button>
        </>
      }
      onClose={close}
      open={open}
      title={t("close.title")}
    >
      <div className="flex flex-col gap-4">
        {updated === null ? (
          <p>{t("close.body")}</p>
        ) : (
          <div className="flex flex-col gap-1 rounded-cards border-2 border-[var(--ar-warning)] p-3" role="alert">
            <p className="flex items-center gap-2 font-semibold">
              <RefreshCw aria-hidden="true" className="size-5" />
              {errors("RENTAL_CHARGES_UPDATED.title")}
            </p>
            <p>{t("close.updatedBody")}</p>
          </div>
        )}
        <dl className="grid grid-cols-2 gap-2">
          <div>
            <dt className="text-sm text-[var(--ar-text-muted)]">{t("charges.total")}</dt>
            <dd className="text-lg font-semibold">{formatMoney(shown.totalCents, locale)}</dd>
          </div>
          <div>
            <dt className="text-sm text-[var(--ar-text-muted)]">{t("charges.balance")}</dt>
            <dd className="text-lg font-bold">{formatMoney(shown.balanceDueCents, locale)}</dd>
          </div>
        </dl>
        {billingFailed ? (
          <div className="flex flex-col gap-1 rounded-cards border-2 border-[var(--ar-danger)] p-3" role="alert">
            <p className="flex items-center gap-2 font-semibold">
              <ReceiptText aria-hidden="true" className="size-5" />
              {t("close.billingFailedTitle")}
            </p>
            <p>{t("close.billingFailedBody")}</p>
          </div>
        ) : held === null ? (error === null ? null : <ErrorAlert error={error} />) : (
          <p className="rounded-cards border-2 border-[var(--ar-danger)] p-3 font-semibold" role="alert">
            {t("close.heldBlocked", { count: held.length })}
          </p>
        )}
        <Field hint={t("close.paymentNoteHint")} label={t("close.paymentNote")}>
          {(p) => <Textarea {...p} maxLength={500} onChange={(e) => setNote(e.target.value)} rows={3} value={note} />}
        </Field>
      </div>
    </Dialog>
  );
}
