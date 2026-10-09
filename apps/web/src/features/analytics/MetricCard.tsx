"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState, QueryState } from "@/components/data/States";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";

import {
  analyticsApi,
  type AnalyticsDTO,
  type AnalyticsFilters,
  type AnalyticsMetric,
  type AnalyticsUnit,
} from "./api";

const PRIMARY = "var(--ar-primary)";
const SECONDARY = "var(--color-terra-600)";
const CHART_HEIGHT = 240;

type Shape = "line" | "column" | "row";

/** Chart shape per metric: time series as lines or columns, rankings as horizontal bars. */
const SHAPES: Readonly<Record<Exclude<AnalyticsMetric, "cost">, Shape>> = {
  mttr: "line",
  first_time_fix: "column",
  reports_by_category: "column",
  wos_by_field_user: "row",
  downtime: "row",
  top_failing: "row",
  rental_utilization: "row",
  rental_revenue: "column",
};

/** Metrics whose `secondary` value is shown as its own table column (and second bar for revenue). */
const WITH_SECONDARY: ReadonlySet<AnalyticsMetric> = new Set([
  "mttr",
  "first_time_fix",
  "wos_by_field_user",
  "top_failing",
  "rental_utilization",
  "rental_revenue",
]);

export function useValueFormatter() {
  const t = useTranslations("analytics");
  const locale = useLocale();
  return (value: number | null | undefined, unit: AnalyticsUnit): string => {
    if (value === null || value === undefined) return t("noValue");
    switch (unit) {
      case "cents":
        return formatMoney(value, locale);
      case "hours":
        return t("units.hours", { value: formatNumber(value, locale, 1) });
      case "percent":
        return t("units.percent", { value: formatNumber(value, locale, 1) });
      case "count":
        return formatNumber(value, locale);
    }
  };
}

function monthLabel(key: string, locale: string): string {
  const [y, m] = key.split("-").map(Number);
  if (y === undefined || m === undefined || Number.isNaN(y) || Number.isNaN(m)) return key;
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 15)));
}

export function MetricCard({
  metric,
  filters,
}: {
  readonly metric: Exclude<AnalyticsMetric, "cost">;
  readonly filters: AnalyticsFilters;
}) {
  const t = useTranslations("analytics");
  const locale = useLocale();
  const format = useValueFormatter();
  const query = useQuery({
    queryKey: ["analytics", metric, filters, locale],
    queryFn: ({ signal }) => analyticsApi.metric(metric, filters, locale, signal),
  });
  const data: AnalyticsDTO | undefined = query.data;
  const shape = SHAPES[metric];

  const labelOf = (key: string, label: string): string => {
    if (metric === "mttr" || metric === "first_time_fix")
      return t("weekOf", { date: formatDate(key, locale) });
    if (metric === "rental_revenue") return monthLabel(key, locale);
    if (metric === "reports_by_category")
      return t.has(`categories.${key}`) ? t(`categories.${key}`) : key;
    if (metric === "wos_by_field_user" && key === "none") return t("unassigned");
    return label;
  };
  const secondaryOf = (value: number | null | undefined): string => {
    if (metric === "wos_by_field_user")
      return value === null || value === undefined
        ? t("noValue")
        : t("units.minutes", { value: formatNumber(value, locale) });
    if (metric === "rental_revenue") return format(value, "cents");
    if (metric === "rental_utilization")
      return t("units.days", { value: formatNumber(value ?? 0, locale, 1) });
    return format(value, "count");
  };
  const rows = (data?.series ?? []).map((point) => ({
    ...point,
    name: labelOf(point.key, point.label),
    secondary: point.secondary ?? null,
  }));
  const headingId = `metric-${metric}`;

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4"
      data-metric={metric}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold" id={headingId}>
            {t(`metrics.${metric}.title`)}
          </h2>
          <p className="text-sm text-[var(--ar-text-muted)]">
            {t(`metrics.${metric}.description`)}
          </p>
        </div>
        {data === undefined ? null : (
          <p className="text-right">
            <span
              className="block text-2xl font-semibold tabular-nums"
              data-testid={`summary-${metric}`}
            >
              {format(data.summary, data.unit)}
            </span>
            <span className="text-xs text-[var(--ar-text-muted)]">
              {t(`metrics.${metric}.summary`)}
            </span>
          </p>
        )}
      </header>
      <QueryState
        empty={
          <EmptyState
            body={t("empty.body")}
            icon={<BarChart3 aria-hidden="true" className="size-6" />}
            title={t("empty.title")}
          />
        }
        error={query.error}
        isEmpty={rows.length === 0}
        isLoading={query.isLoading}
        onRetry={() => void query.refetch()}
      >
        {data === undefined ? null : (
          <>
            <div aria-hidden="true" style={{ height: CHART_HEIGHT }}>
              <ResponsiveContainer
                height="100%"
                initialDimension={{ width: 480, height: CHART_HEIGHT }}
                width="100%"
              >
                {shape === "line" ? (
                  <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                    <CartesianGrid stroke="var(--ar-border)" strokeDasharray="3 3" />
                    <XAxis dataKey="name" fontSize={12} />
                    <YAxis fontSize={12} width={48} />
                    <Tooltip formatter={(value) => format(Number(value), data.unit)} />
                    <Line dataKey="value" dot stroke={PRIMARY} strokeWidth={2} type="monotone" />
                  </LineChart>
                ) : shape === "column" ? (
                  <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                    <CartesianGrid stroke="var(--ar-border)" strokeDasharray="3 3" />
                    <XAxis dataKey="name" fontSize={12} />
                    <YAxis
                      fontSize={12}
                      tickFormatter={(value: number) =>
                        data.unit === "cents"
                          ? formatNumber(value / 100, locale)
                          : formatNumber(value, locale)
                      }
                      width={56}
                    />
                    <Tooltip formatter={(value) => format(Number(value), data.unit)} />
                    <Bar
                      dataKey="value"
                      fill={PRIMARY}
                      name={t(`metrics.${metric}.title`)}
                      radius={[4, 4, 0, 0]}
                    />
                    {metric === "rental_revenue" ? (
                      <Bar
                        dataKey="secondary"
                        fill={SECONDARY}
                        name={t("metrics.rental_revenue.secondary")}
                        radius={[4, 4, 0, 0]}
                      />
                    ) : null}
                  </BarChart>
                ) : (
                  <BarChart
                    data={rows}
                    layout="vertical"
                    margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
                  >
                    <CartesianGrid
                      horizontal={false}
                      stroke="var(--ar-border)"
                      strokeDasharray="3 3"
                    />
                    <XAxis fontSize={12} type="number" />
                    <YAxis dataKey="name" fontSize={12} type="category" width={140} />
                    <Tooltip formatter={(value) => format(Number(value), data.unit)} />
                    <Bar dataKey="value" fill={PRIMARY} radius={[0, 4, 4, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
            <details className="text-sm">
              <summary className="flex min-h-12 cursor-pointer items-center font-medium text-[var(--ar-link)]">
                {t("table.show")}
              </summary>
              <table className="mt-2 w-full text-left">
                <caption className="sr-only">
                  {t("table.caption", { metric: t(`metrics.${metric}.title`) })}
                </caption>
                <thead>
                  <tr className="text-[var(--ar-text-muted)]">
                    <th className="py-1 pr-2 font-medium" scope="col">
                      {t(`metrics.${metric}.key`)}
                    </th>
                    <th className="py-1 pr-2 text-right font-medium" scope="col">
                      {t(`metrics.${metric}.value`)}
                    </th>
                    {WITH_SECONDARY.has(metric) ? (
                      <th className="py-1 text-right font-medium" scope="col">
                        {t(`metrics.${metric}.secondary`)}
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      className="border-t border-[var(--ar-border)]"
                      data-row={row.key}
                      key={row.key}
                    >
                      <th className="py-1 pr-2 font-normal" scope="row">
                        {row.name}
                      </th>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        {format(row.value, data.unit)}
                      </td>
                      {WITH_SECONDARY.has(metric) ? (
                        <td className="py-1 text-right tabular-nums">
                          {secondaryOf(row.secondary)}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        )}
      </QueryState>
    </section>
  );
}
