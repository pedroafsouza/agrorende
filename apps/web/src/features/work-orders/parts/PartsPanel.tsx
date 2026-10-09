"use client";

import { useLocale, useTranslations } from "next-intl";

import { formatMoney, formatNumber } from "@/lib/format";

import type { WorkOrderDetail } from "../types";

/** Parts used on a work order (WO-22). Owned by T14 from wave 6 on (DELIVERY-PLAN §3.5). */
export function PartsPanel({ parts }: { readonly parts: WorkOrderDetail["parts"] }) {
  const t = useTranslations("jobs");
  const locale = useLocale();
  return (
    <section className="rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4">
      <h2 className="mb-3 text-lg font-semibold">{t("detail.parts")}</h2>
      {parts.length === 0 ? (
        <p className="text-[var(--ar-text-muted)]">{t("detail.noParts")}</p>
      ) : (
        <table className="w-full text-left">
          <caption className="sr-only">{t("detail.parts")}</caption>
          <thead>
            <tr className="border-b border-[var(--ar-border)] text-sm">
              <th className="py-2">{t("fields.partName")}</th>
              <th className="py-2">{t("fields.quantity")}</th>
              <th className="py-2">{t("fields.unitCost")}</th>
            </tr>
          </thead>
          <tbody>
            {parts.map((part) => (
              <tr className="border-b border-[var(--ar-border)]" key={part.id}>
                <td className="py-2">
                  {part.name}
                  {part.partNumber ? <span className="ml-2 font-mono text-sm text-[var(--ar-text-muted)]">{part.partNumber}</span> : null}
                </td>
                <td className="py-2">
                  {formatNumber(part.quantity, locale, 2)} {part.unit}
                </td>
                <td className="py-2">{formatMoney(part.unitCostCents ?? null, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
