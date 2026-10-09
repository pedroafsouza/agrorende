"use client";

import { Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { MoneyInput } from "@/components/forms/MoneyInput";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { formatMoney } from "@/lib/format";

import { draftTotals, type LineDraft } from "./types";

let counter = 0;
export function newLine(partial: Partial<Omit<LineDraft, "key">> = {}): LineDraft {
  counter += 1;
  return { key: `line-${counter}`, description: partial.description ?? "", quantity: partial.quantity ?? "1", unitAmountCents: partial.unitAmountCents ?? null };
}

/** Editable billing lines with live totals; invalid rows are flagged inline next to the row. */
export function LinesEditor({ lines, invalid, discountCents, onChange, onDiscount }: { readonly lines: readonly LineDraft[]; readonly invalid: readonly number[]; readonly discountCents: number; readonly onChange: (lines: LineDraft[]) => void; readonly onDiscount: (cents: number) => void }) {
  const t = useTranslations("billing");
  const locale = useLocale();
  const totals = draftTotals(lines, discountCents);
  const update = (index: number, patch: Partial<LineDraft>) => onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  return (
    <div className="flex flex-col gap-3">
      {lines.map((line, index) => (
        <fieldset className="grid items-end gap-2 rounded-cards border border-[var(--ar-border)] p-3 md:grid-cols-[2fr_1fr_1fr_auto]" key={line.key}>
          <legend className="sr-only">{t("lines.row", { index: index + 1 })}</legend>
          <Field error={invalid.includes(index) ? t("lines.invalid") : undefined} label={t("lines.description")}>
            {(p) => <Input {...p} maxLength={200} onChange={(e) => update(index, { description: e.target.value })} value={line.description} />}
          </Field>
          <Field label={t("lines.quantity")}>{(p) => <Input {...p} inputMode="decimal" onChange={(e) => update(index, { quantity: e.target.value })} value={line.quantity} />}</Field>
          <Field label={t("lines.unitAmount")}>{(p) => <MoneyInput {...p} cents={line.unitAmountCents} onChange={(unitAmountCents) => update(index, { unitAmountCents })} />}</Field>
          <Button aria-label={t("lines.remove", { index: index + 1 })} disabled={lines.length <= 1} icon={<Trash2 aria-hidden="true" className="size-4" />} onClick={() => onChange(lines.filter((_, i) => i !== index))}>
            {t("lines.removeShort")}
          </Button>
        </fieldset>
      ))}
      <div>
        <Button icon={<Plus aria-hidden="true" className="size-4" />} onClick={() => onChange([...lines, newLine()])}>
          {t("lines.add")}
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Field hint={t("lines.discountHint")} label={t("fields.discount")}>
          {(p) => <MoneyInput {...p} cents={discountCents} onChange={(cents) => onDiscount(cents ?? 0)} />}
        </Field>
        <div className="flex flex-col justify-end">
          <span className="text-sm text-[var(--ar-text-muted)]">{t("fields.subtotal")}</span>
          <span className="font-semibold">{formatMoney(totals.subtotalCents, locale)}</span>
        </div>
        <div className="flex flex-col justify-end">
          <span className="text-sm text-[var(--ar-text-muted)]">{t("fields.total")}</span>
          <span aria-live="polite" className="text-lg font-bold">
            {formatMoney(totals.totalCents, locale)}
          </span>
        </div>
      </div>
    </div>
  );
}
