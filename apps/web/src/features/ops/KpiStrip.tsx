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
  const summary = [
    { key: "slaCompliance", value: kpis?.slaCompliancePct === null || kpis === undefined ? "—" : `${formatNumber(kpis.slaCompliancePct, locale, 1)}%` },
    { key: "mttr", value: kpis?.mttrHours === null || kpis === undefined ? "—" : t("hours", { value: formatNumber(kpis.mttrHours, locale, 1) }) },
    { key: "utilization", value: kpis?.utilizationPct === null || kpis === undefined ? "—" : `${formatNumber(kpis.utilizationPct, locale, 0)}%` },
  ] as const;
  return (
    <section aria-label={t("label")} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm" data-testid="kpi-summary">
          {summary.map((item) => (
            <div className="flex items-baseline gap-1.5" key={item.key}>
              <dt className="text-[var(--ar-text-muted)]">{t(`summary.${item.key}`)}</dt>
              <dd className="font-semibold tabular-nums">{item.value}</dd>
            </div>
          ))}
        </dl>
        <div aria-label={t("range")} className="inline-flex rounded-controls border border-[var(--ar-border-strong)] bg-[var(--ar-surface)] p-0.5" role="group">
          {KPI_RANGE_OPTIONS.map((r) => (
            <button
              aria-pressed={range === r}
              className="min-h-12 rounded-[6px] px-3 text-sm font-semibold aria-pressed:bg-[var(--ar-primary)] aria-pressed:text-[var(--ar-on-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ar-focus)]"
              key={r}
              onClick={() => onRange(r)}
              type="button"
            >
              {t(`ranges.${r}`)}
            </button>
          ))}
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {KPI_KEYS.map((key) => {
          const Icon = ICONS[key];
          const value = kpis?.counts[key];
          const pressed = active === key;
          const alarming = ALARM.has(key) && (value ?? 0) > 0;
          return (
            <li className="min-w-0" key={key}>
              <button
                aria-pressed={pressed}
                className={[
                  "flex h-full min-h-20 w-full flex-col justify-between gap-1 rounded-cards border px-4 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ar-focus)]",
                  pressed
                    ? "border-[var(--ar-primary)] bg-[var(--ar-primary-bg)] shadow-[inset_0_0_0_1px_var(--ar-primary)]"
                    : alarming
                      ? "border-[var(--ar-border)] bg-[var(--ar-warning-bg)] hover:border-[var(--ar-border-strong)]"
                      : "border-[var(--ar-border)] bg-[var(--ar-surface)] hover:border-[var(--ar-border-strong)]",
                ].join(" ")}
                data-alarm={alarming ? "" : undefined}
                data-kpi={key}
                onClick={() => onSelect(pressed ? null : key)}
                type="button"
              >
                <span className={`flex min-w-0 items-center gap-2 text-sm font-medium ${alarming ? "text-[var(--ar-warning-text)]" : "text-[var(--ar-text-muted)]"}`}>
                  <Icon aria-hidden="true" className="size-4 shrink-0" />
                  <span className="leading-tight sm:truncate">{t(`keys.${key}`)}</span>
                </span>
                <span className={`text-2xl font-bold leading-none tabular-nums ${alarming ? "text-[var(--ar-warning-text)]" : ""}`}>{value === undefined ? "—" : formatNumber(value, locale)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
