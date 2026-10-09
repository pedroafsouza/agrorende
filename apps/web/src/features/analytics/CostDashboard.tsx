"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, EyeOff, Wallet } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState, QueryState } from "@/components/data/States";
import { Field, Select } from "@/components/ui/Field";
import { formatMoney, formatNumber } from "@/lib/format";

import {
  analyticsApi,
  COST_DASHBOARD_GROUPS,
  type AnalyticsFilters,
  type CostDashboardGroup,
} from "./api";

const CHART_ROWS = 12;
const STACK = [
  { key: "laborCents", color: "var(--ar-primary)" },
  { key: "partsCents", color: "var(--color-terra-600)" },
  { key: "rentInCostCents", color: "var(--color-graphite-500)" },
] as const;

/** Cost dashboard tab (T16.2): the cost roll-up of T09 charted by machine, farm or season. */
export function CostDashboard({
  filters,
  groupBy,
  onGroupBy,
}: {
  readonly filters: AnalyticsFilters;
  readonly groupBy: CostDashboardGroup;
  readonly onGroupBy: (group: CostDashboardGroup) => void;
}) {
  const t = useTranslations("analytics");
  const locale = useLocale();
  const query = useQuery({
    queryKey: ["analytics", "cost", filters, groupBy, locale],
    queryFn: ({ signal }) => analyticsApi.metric("cost", { ...filters, groupBy }, locale, signal),
  });
  const cost = query.data?.cost;
  const stack = STACK.filter((s) => s.key !== "laborCents" || cost?.laborVisible !== false);
  const rows = (cost?.rows ?? []).slice(0, CHART_ROWS);
  const money = (cents: number) => formatMoney(cents, locale);
  const detailsHref = `/costs?${new URLSearchParams(Object.entries({ groupBy, from: filters.from, to: filters.to, seasonId: filters.seasonId }).filter(([, v]) => v !== "")).toString()}`;

  return (
    <section aria-labelledby="cost-dashboard" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold" id="cost-dashboard">
          {t("cost.title")}
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t("cost.groupBy")}>
            {(props) => (
              <Select
                {...props}
                onChange={(e) => onGroupBy(e.target.value as CostDashboardGroup)}
                value={groupBy}
              >
                {COST_DASHBOARD_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {t(`cost.groups.${g}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Link
            className="flex min-h-12 items-center gap-2 rounded-controls px-3 font-semibold text-[var(--ar-link)] underline-offset-4 hover:underline"
            href={detailsHref}
          >
            {t("cost.details")}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </div>
      {cost !== undefined && !cost.laborVisible ? (
        <p
          className="flex items-center gap-2 rounded-controls bg-[var(--ar-info-bg)] p-3 text-sm text-[var(--ar-info-text)]"
          role="note"
        >
          <EyeOff aria-hidden="true" className="size-4 shrink-0" />
          {t("cost.laborHidden")}
        </p>
      ) : null}
      <QueryState
        empty={
          <EmptyState
            body={t("empty.body")}
            icon={<Wallet aria-hidden="true" className="size-6" />}
            title={t("empty.title")}
          />
        }
        error={query.error}
        isEmpty={(cost?.rows.length ?? 0) === 0}
        isLoading={query.isLoading}
        onRetry={() => void query.refetch()}
      >
        {cost === undefined ? null : (
          <>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(
                ["totalCostCents", "partsCents", "rentInCostCents", "rentalRevenueCents"] as const
              ).map((k) => (
                <div
                  className="rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4"
                  key={k}
                >
                  <dt className="text-sm text-[var(--ar-text-muted)]">{t(`cost.columns.${k}`)}</dt>
                  <dd className="text-2xl font-semibold tabular-nums" data-testid={`cost-${k}`}>
                    {money(cost.totals[k])}
                  </dd>
                </div>
              ))}
            </dl>
            <div
              aria-hidden="true"
              className="rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4"
              style={{ height: 360 }}
            >
              <ResponsiveContainer
                height="100%"
                initialDimension={{ width: 800, height: 320 }}
                width="100%"
              >
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
                  <XAxis
                    fontSize={12}
                    tickFormatter={(value: number) => formatNumber(value / 100, locale)}
                    type="number"
                  />
                  <YAxis dataKey="label" fontSize={12} type="category" width={160} />
                  <Tooltip formatter={(value) => money(Number(value))} />
                  <Legend />
                  {stack.map((s) => (
                    <Bar
                      dataKey={s.key}
                      fill={s.color}
                      key={s.key}
                      name={t(`cost.columns.${s.key}`)}
                      stackId="cost"
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)]">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <caption className="sr-only">
                  {t("cost.caption", { group: t(`cost.groups.${groupBy}`) })}
                </caption>
                <thead className="bg-[var(--ar-surface-muted)]">
                  <tr>
                    <th className="px-4 py-3 font-semibold" scope="col">
                      {t(`cost.groups.${groupBy}`)}
                    </th>
                    {[
                      ...stack.map((s) => s.key),
                      "totalCostCents" as const,
                      "rentalRevenueCents" as const,
                    ].map((k) => (
                      <th className="px-4 py-3 text-right font-semibold" key={k} scope="col">
                        {t(`cost.columns.${k}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cost.rows.map((row) => (
                    <tr
                      className="border-t border-[var(--ar-border)]"
                      data-row={row.key}
                      key={row.key}
                    >
                      <th className="h-12 px-4 py-2 font-medium" scope="row">
                        {row.label}
                      </th>
                      {[
                        ...stack.map((s) => s.key),
                        "totalCostCents" as const,
                        "rentalRevenueCents" as const,
                      ].map((k) => (
                        <td
                          className={`px-4 py-2 text-right tabular-nums ${k === "totalCostCents" ? "font-semibold" : ""}`}
                          key={k}
                        >
                          {money(row[k])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </QueryState>
    </section>
  );
}
