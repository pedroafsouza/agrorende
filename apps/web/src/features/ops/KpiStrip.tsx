"use client";

import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, Clock, Inbox, KeyRound, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ComponentType } from "react";

import { formatNumber } from "@/lib/format";

import { KPI_KEYS, type KpiKey, type KpiRange, type OpsKpisDTO } from "./types";

const ICONS: Readonly<Record<KpiKey, ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>>> = {
  open_reports: Inbox,
  unassigned_wos: ClipboardList,
  in_progress: Clock,
  done_today: CheckCircle2,
  sla_at_risk: AlertTriangle,
  active_rentals: KeyRound,
  overdue_rentals: CalendarClock,
  on_duty: Users,
};

const ALARM: ReadonlySet<KpiKey> = new Set(["sla_at_risk", "overdue_rentals"]);

export const KPI_RANGE_OPTIONS: readonly KpiRange[] = ["today", "7d", "30d"];

export interface KpiStripProps {
  readonly kpis: OpsKpisDTO | undefined;
  readonly active: KpiKey | null;
  readonly onSelect: (kpi: KpiKey | null) => void;
  readonly range: KpiRange;
  readonly onRange: (range: KpiRange) => void;
}

/** KPI tiles are toggle buttons: pressing one filters the map and lists through `?kpi=` (A§14.3). */
export function KpiStrip({ kpis, active, onSelect, range, onRange }: KpiStripProps) {
  const t = useTranslations("ops.kpi");
  const locale = useLocale();
  return (
    <section aria-label={t("label")} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--ar-text-muted)]">
          <span>{t("slaCompliance", { value: kpis?.slaCompliancePct === null || kpis === undefined ? "—" : `${formatNumber(kpis.slaCompliancePct, locale, 1)}%` })}</span>
          <span>{t("mttr", { value: kpis?.mttrHours === null || kpis === undefined ? "—" : formatNumber(kpis.mttrHours, locale, 1) })}</span>
          <span>{t("utilization", { value: kpis?.utilizationPct === null || kpis === undefined ? "—" : `${formatNumber(kpis.utilizationPct, locale, 0)}%` })}</span>
        </div>
        <div aria-label={t("range")} className="inline-flex rounded-controls border border-[var(--ar-border-strong)] bg-[var(--ar-surface)] p-0.5" role="group">
          {KPI_RANGE_OPTIONS.map((r) => (
            <button
              aria-pressed={range === r}
              className="min-h-12 rounded-controls px-3 text-sm font-semibold aria-pressed:bg-[var(--ar-primary)] aria-pressed:text-[var(--ar-on-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ar-focus)]"
              key={r}
              onClick={() => onRange(r)}
              type="button"
            >
              {t(`ranges.${r}`)}
            </button>
          ))}
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {KPI_KEYS.map((key) => {
          const Icon = ICONS[key];
          const value = kpis?.counts[key];
          const pressed = active === key;
          const alarming = ALARM.has(key) && (value ?? 0) > 0;
          return (
            <li key={key}>
              <button
                aria-pressed={pressed}
                className={[
                  "flex min-h-[4.5rem] w-full flex-col items-start justify-between rounded-cards border-2 px-3 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ar-focus)]",
                  pressed ? "border-[var(--ar-primary)] bg-[var(--ar-primary-bg)]" : alarming ? "border-[var(--ar-warning)] bg-[var(--ar-surface)]" : "border-[var(--ar-border)] bg-[var(--ar-surface)] hover:border-[var(--ar-border-strong)]",
                ].join(" ")}
                data-kpi={key}
                onClick={() => onSelect(pressed ? null : key)}
                type="button"
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ar-text-muted)]">
                  <Icon aria-hidden="true" className="size-4 shrink-0" />
                  {t(`keys.${key}`)}
                </span>
                <span className="text-2xl font-bold tabular-nums">{value === undefined ? "—" : formatNumber(value, locale)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
