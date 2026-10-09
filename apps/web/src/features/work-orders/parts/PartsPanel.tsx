"use client";

import { useQuery } from "@tanstack/react-query";
import { BookOpen, PenLine } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/api";
import { formatMoney, formatNumber } from "@/lib/format";
import type { ListPage } from "@/lib/forms";

import type { WorkOrderDetail } from "../types";

/** The detail endpoint returns the full `WorkOrderPartDTO`; catalog lines carry the part and the stock location. */
export type PartLine = WorkOrderDetail["parts"][number] & { readonly partId?: string | null; readonly stockLocationId?: string | null };

interface LevelRow {
  readonly partId: string;
  readonly stockLocationId: string;
  readonly quantity: number;
  readonly locationName: string;
}

export function isCatalogLine(line: PartLine): boolean {
  return line.partId !== null && line.partId !== undefined && line.stockLocationId !== null && line.stockLocationId !== undefined;
}

/** Parts used on a work order (WO-09, WO-22): catalog lines show where they came from and what is left there. */
export function PartsPanel({ parts }: { readonly parts: WorkOrderDetail["parts"] }) {
  return <PartsTable lines={parts as readonly PartLine[]} />;
}

function PartsTable({ lines }: { readonly lines: readonly PartLine[] }) {
  const t = useTranslations("jobs");
  const p = useTranslations("parts");
  const locale = useLocale();
  const hasCatalog = lines.some(isCatalogLine);
  const levels = useQuery({ queryKey: ["stock-levels", { panel: true }], queryFn: () => api<ListPage<LevelRow>>("/stock-levels"), enabled: hasCatalog });
  const levelOf = (line: PartLine) => levels.data?.items.find((l) => l.partId === line.partId && l.stockLocationId === line.stockLocationId);
  return (
    <section className="rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4">
      <h2 className="mb-3 text-lg font-semibold">{t("detail.parts")}</h2>
      {lines.length === 0 ? (
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
            {lines.map((line) => {
              const level = isCatalogLine(line) ? levelOf(line) : undefined;
              return (
                <tr className="border-b border-[var(--ar-border)] align-top" key={line.id}>
                  <td className="py-2">
                    <span className="flex flex-col gap-1">
                      <span>
                        {line.name}
                        {line.partNumber ? <span className="ml-2 font-mono text-sm text-[var(--ar-text-muted)]">{line.partNumber}</span> : null}
                      </span>
                      {isCatalogLine(line) ? (
                        <span className="flex flex-wrap items-center gap-2 text-sm text-[var(--ar-text-muted)]">
                          <Badge icon={<BookOpen aria-hidden="true" className="size-4" />} tone="info">
                            {p("panel.catalog")}
                          </Badge>
                          {level === undefined ? null : (
                            <span>
                              {p("panel.takenFrom", { location: level.locationName })} · {p("panel.left", { quantity: formatNumber(level.quantity, locale, 2) })}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="flex flex-wrap items-center gap-2 text-sm text-[var(--ar-text-muted)]">
                          <Badge icon={<PenLine aria-hidden="true" className="size-4" />} tone="neutral">
                            {p("panel.freeText")}
                          </Badge>
                          {p("panel.freeTextHint")}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-2">
                    {formatNumber(line.quantity, locale, 2)} {line.unit}
                  </td>
                  <td className="py-2">{formatMoney(line.unitCostCents ?? null, locale)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
