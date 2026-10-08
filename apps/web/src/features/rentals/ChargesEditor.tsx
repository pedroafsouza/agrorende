"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { LoadingState } from "@/components/data/States";
import { MoneyInput } from "@/components/forms/MoneyInput";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { formatMoney, formatNumber } from "@/lib/format";
import { useFieldErrors } from "@/lib/forms";

import { MANUAL_CHARGE_TYPES, type ChargesView, type ManualChargeType, type RentalChargeDTO } from "./types";

interface NewLine {
  readonly type: ManualChargeType;
  readonly description: string;
  readonly quantity: string;
  readonly unitAmountCents: number | null;
}

const EMPTY_LINE: NewLine = { type: "OTHER", description: "", quantity: "1", unitAmountCents: null };

/** Charges review (RN-08): auto lines are recomputed by the server, manual lines are added or removed here. */
export function ChargesEditor({ rentalId, editable }: { readonly rentalId: string; readonly editable: boolean }) {
  const t = useTranslations("rentals");
  const locale = useLocale();
  const client = useQueryClient();
  const fieldErrorsOf = useFieldErrors();
  const query = useQuery({ queryKey: ["rentals", rentalId, "charges"], queryFn: () => api<ChargesView>(`/rentals/${rentalId}/charges`) });
  const [line, setLine] = useState<NewLine>(EMPTY_LINE);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const run = async (key: string, write: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setError(null);
    try {
      await write();
      await client.invalidateQueries({ queryKey: ["rentals"] });
      toast.success(t(done));
      return true;
    } catch (caught) {
      setError(caught);
      return false;
    } finally {
      setBusy(null);
    }
  };

  if (query.isLoading) return <LoadingState rows={3} />;
  if (query.error !== null || query.data === undefined) return <ErrorAlert error={query.error} onRetry={() => void query.refetch()} />;
  const view = query.data;
  const fieldErrors = fieldErrorsOf(error);
  const quantity = Number(line.quantity.replace(",", "."));
  const canAdd = line.description.trim().length > 0 && line.unitAmountCents !== null && Number.isFinite(quantity) && quantity > 0;
  const add = async () => {
    if (!canAdd || line.unitAmountCents === null) return;
    const ok = await run("add", () => api<RentalChargeDTO>(`/rentals/${rentalId}/charges`, { method: "POST", body: { type: line.type, description: line.description.trim(), quantity, unitAmountCents: line.unitAmountCents } }), "toast.lineAdded");
    if (ok) setLine(EMPTY_LINE);
  };

  return (
    <div className="flex flex-col gap-4">
      {error === null ? null : <ErrorAlert error={error} />}
      {view.heldDamageIds.length > 0 ? (
        <p className="flex items-center gap-2 rounded-cards border-2 border-[var(--ar-warning)] p-3 font-semibold" role="status">
          <Lock aria-hidden="true" className="size-5" />
          {t("charges.held", { count: view.heldDamageIds.length })}
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <caption className="sr-only">{t("charges.title")}</caption>
          <thead>
            <tr className="border-b border-[var(--ar-border)] text-sm">
              <th className="p-2" scope="col">{t("charges.type")}</th>
              <th className="p-2" scope="col">{t("charges.description")}</th>
              <th className="p-2 text-right" scope="col">{t("charges.quantity")}</th>
              <th className="p-2 text-right" scope="col">{t("charges.unitAmount")}</th>
              <th className="p-2 text-right" scope="col">{t("charges.amount")}</th>
              <th className="p-2" scope="col"><span className="sr-only">{t("charges.lineActions")}</span></th>
            </tr>
          </thead>
          <tbody>
            {view.lines.length === 0 ? (
              <tr>
                <td className="p-2 text-[var(--ar-text-muted)]" colSpan={6}>{t("charges.empty")}</td>
              </tr>
            ) : (
              view.lines.map((charge) => (
                <tr className="border-b border-[var(--ar-border)]" key={charge.id}>
                  <td className="p-2">
                    <span className="flex flex-wrap items-center gap-2">
                      {t(`chargeType.${charge.type}`)}
                      {charge.isAuto ? <Badge tone="neutral">{t("charges.auto")}</Badge> : null}
                    </span>
                  </td>
                  <td className="p-2">{charge.description}</td>
                  <td className="p-2 text-right">{formatNumber(charge.quantity, locale, 2)}</td>
                  <td className="p-2 text-right">{formatMoney(charge.unitAmountCents, locale)}</td>
                  <td className="p-2 text-right font-semibold">{formatMoney(charge.amountCents, locale)}</td>
                  <td className="p-2 text-right">
                    {editable && !charge.isAuto ? (
                      <Button
                        aria-label={t("charges.deleteLine", { description: charge.description })}
                        busy={busy === charge.id}
                        icon={<Trash2 aria-hidden="true" className="size-4" />}
                        onClick={() => void run(charge.id, () => api<undefined>(`/rentals/${rentalId}/charges/${charge.id}`, { method: "DELETE" }), "toast.lineDeleted")}
                        size="icon"
                        variant="ghost"
                      />
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <dl className="grid gap-2 sm:grid-cols-3">
        <Total label={t("charges.total")} value={formatMoney(view.totalCents, locale)} />
        <Total label={t("charges.deposit")} value={formatMoney(view.depositCents, locale)} />
        <Total emphasis label={t("charges.balance")} value={formatMoney(view.balanceDueCents, locale)} />
      </dl>
      {editable ? (
        <>
          <form
            className="grid items-end gap-3 rounded-cards border border-[var(--ar-border)] p-3 md:grid-cols-[1fr_2fr_0.6fr_1fr_auto]"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void add();
            }}
          >
            <Field label={t("charges.type")}>
              {(p) => (
                <Select {...p} onChange={(e) => setLine({ ...line, type: e.target.value as ManualChargeType })} value={line.type}>
                  {MANUAL_CHARGE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`chargeType.${type}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field error={fieldErrors.description} label={t("charges.description")}>
              {(p) => <Input {...p} maxLength={200} onChange={(e) => setLine({ ...line, description: e.target.value })} value={line.description} />}
            </Field>
            <Field error={fieldErrors.quantity} label={t("charges.quantity")}>
              {(p) => <Input {...p} inputMode="decimal" onChange={(e) => setLine({ ...line, quantity: e.target.value })} value={line.quantity} />}
            </Field>
            <Field error={fieldErrors.unitAmountCents} hint={line.type === "DISCOUNT" ? t("charges.discountHint") : undefined} label={t("charges.unitAmount")}>
              {(p) => <MoneyInput {...p} cents={line.unitAmountCents} onChange={(unitAmountCents) => setLine({ ...line, unitAmountCents })} />}
            </Field>
            <Button busy={busy === "add"} disabled={!canAdd} icon={<Plus aria-hidden="true" className="size-4" />} type="submit" variant="primary">
              {t("charges.add")}
            </Button>
          </form>
          <div>
            <Button busy={busy === "recompute"} icon={<RefreshCw aria-hidden="true" className="size-4" />} onClick={() => void run("recompute", () => api<RentalChargeDTO[]>(`/rentals/${rentalId}/charges/recompute`, { method: "POST", body: {} }), "toast.recomputed")}>
              {t("charges.recompute")}
            </Button>
          </div>
        </>
      ) : (
        <p className="text-sm text-[var(--ar-text-muted)]">{t("charges.readOnly")}</p>
      )}
    </div>
  );
}

function Total({ label, value, emphasis = false }: { readonly label: string; readonly value: string; readonly emphasis?: boolean }) {
  return (
    <div className={emphasis ? "rounded-controls bg-[var(--ar-surface-muted)] p-3" : "p-3"}>
      <dt className="text-sm text-[var(--ar-text-muted)]">{label}</dt>
      <dd className={emphasis ? "text-xl font-bold" : "text-lg font-semibold"}>{value}</dd>
    </div>
  );
}
