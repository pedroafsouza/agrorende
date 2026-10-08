"use client";

import { useQuery } from "@tanstack/react-query";
import { EyeOff, Info, Sprout } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import type { CostGroupBy, CostRollupDTO, CostRollupRow } from "@agrorende/core/modules/costs/dto";
import type { SeasonDTO, SiteDTO } from "@agrorende/contracts/dto";

import { EmptyState, QueryState } from "@/components/data/States";
import { PageHeader } from "@/components/shell/PageHeader";
import { Field, Input, Select } from "@/components/ui/Field";
import { ExportButton } from "@/features/ops/exports/ExportControls";
import type { ExportEntity, ExportFilters, ExportStart } from "@/features/exports/api";
import { api } from "@/lib/api";
import { formatMoney, formatNumber } from "@/lib/format";
import type { ListPage } from "@/lib/forms";
import { useUrlState } from "@/lib/url-state";

/** Mirrors core `COST_GROUP_BYS`; kept local so the client bundle never pulls core runtime code. */
export const COST_GROUP_BY_OPTIONS: readonly CostGroupBy[] = ["asset", "site", "plot", "season", "category", "crop"];
const NONE_KEY = "none";

const COLUMNS = ["laborCents", "partsCents", "externalCents", "fuelCents", "rentInCostCents", "totalCostCents", "rentalRevenueCents"] as const satisfies readonly (keyof CostRollupRow)[];
type MoneyColumn = (typeof COLUMNS)[number];

const URL_KEYS = ["groupBy", "from", "to", "seasonId", "assetId", "siteId"] as const;
const URL_DEFAULTS = { groupBy: "asset" };

export const costsApi = {
  rollup: (filters: Readonly<Record<string, string>>, locale: string, signal?: AbortSignal) =>
    api<CostRollupDTO>("/costs/rollup", { query: { ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== "")), locale }, ...(signal === undefined ? {} : { signal }) }),
};

export function CostsPage({ exportStart }: { readonly exportStart?: (entity: ExportEntity, filters: ExportFilters, locale: string) => Promise<ExportStart> }) {
  const t = useTranslations("costs");
  const locale = useLocale();
  const [filters, setFilters] = useUrlState(URL_KEYS, URL_DEFAULTS);
  const groupBy = (COST_GROUP_BY_OPTIONS as readonly string[]).includes(filters.groupBy) ? (filters.groupBy as CostGroupBy) : "asset";
  const query = useQuery({ queryKey: ["costs", "rollup", filters, locale], queryFn: ({ signal }) => costsApi.rollup(filters, locale, signal) });
  const seasons = useQuery({ queryKey: ["seasons"], queryFn: () => api<ListPage<SeasonDTO>>("/seasons"), retry: false });
  const sites = useQuery({ queryKey: ["sites", { limit: 100 }], queryFn: () => api<ListPage<SiteDTO>>("/sites", { query: { limit: 100 } }), retry: false });

  const data = query.data;
  const visibleColumns = useMemo(() => COLUMNS.filter((c) => c !== "laborCents" || data?.laborVisible !== false), [data?.laborVisible]);
  const exportFilters = useMemo(() => Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== "")), [filters]);
  const hasNone = data?.rows.some((r) => r.key === NONE_KEY) ?? false;

  const money = (cents: number) => formatMoney(cents, locale);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader actions={<ExportButton entity="costs" filters={exportFilters} {...(exportStart === undefined ? {} : { start: exportStart })} />} subtitle={t("subtitle")} title={t("title")} />
      <form aria-label={t("filters.label")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" onSubmit={(e) => e.preventDefault()} role="search">
        <Field label={t("filters.groupBy")}>
          {(props) => (
            <Select {...props} onChange={(e) => setFilters({ groupBy: e.target.value })} value={groupBy}>
              {COST_GROUP_BY_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {t(`groupBy.${g}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("filters.from")}>{(props) => <Input {...props} onChange={(e) => setFilters({ from: e.target.value })} type="date" value={filters.from} />}</Field>
        <Field label={t("filters.to")}>{(props) => <Input {...props} onChange={(e) => setFilters({ to: e.target.value })} type="date" value={filters.to} />}</Field>
        <Field label={t("filters.season")}>
          {(props) => (
            <Select {...props} onChange={(e) => setFilters({ seasonId: e.target.value })} value={filters.seasonId}>
              <option value="">{t("filters.all")}</option>
              <option value={NONE_KEY}>{t("noSeason")}</option>
              {(seasons.data?.items ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("filters.site")}>
          {(props) => (
            <Select {...props} onChange={(e) => setFilters({ siteId: e.target.value })} value={filters.siteId}>
              <option value="">{t("filters.all")}</option>
              <option value={NONE_KEY}>{t("noSite")}</option>
              {(sites.data?.items ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("filters.asset")}>{(props) => <Input {...props} onChange={(e) => setFilters({ assetId: e.target.value })} placeholder={t("filters.assetPlaceholder")} value={filters.assetId} />}</Field>
      </form>
      {data !== undefined && !data.laborVisible ? (
        <p className="flex items-center gap-2 rounded-controls bg-[var(--ar-info-bg)] p-3 text-sm text-[var(--ar-info-text)]" role="note">
          <EyeOff aria-hidden="true" className="size-4 shrink-0" />
          {t("laborHidden")}
        </p>
      ) : null}
      {hasNone && groupBy === "season" ? (
        <div className="flex items-start gap-2 rounded-controls border border-[var(--ar-warning)] bg-[var(--ar-warning-bg)] p-3 text-sm" role="note">
          <Sprout aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">{t("seasonMissing.title")}</p>
            <p>{t("seasonMissing.body")}</p>
          </div>
        </div>
      ) : null}
      <QueryState
        empty={<EmptyState body={t("empty.body")} icon={<Info aria-hidden="true" className="size-6" />} title={t("empty.title")} />}
        error={query.error}
        isEmpty={(data?.rows.length ?? 0) === 0}
        isLoading={query.isLoading}
        onRetry={() => void query.refetch()}
      >
        {data === undefined ? null : (
          <div className="overflow-x-auto rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)]">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <caption className="sr-only">{t("table.caption", { groupBy: t(`groupBy.${data.groupBy}`) })}</caption>
              <thead className="bg-[var(--ar-surface-muted)]">
                <tr>
                  <th className="px-4 py-3 font-semibold" scope="col">
                    {t(`groupBy.${data.groupBy}`)}
                  </th>
                  {visibleColumns.map((c) => (
                    <th className="px-4 py-3 text-right font-semibold" key={c} scope="col">
                      {t(`columns.${c}`)}
                      {c === "externalCents" || c === "fuelCents" ? <span className="block text-xs font-normal text-[var(--ar-text-muted)]">{t("columns.soon")}</span> : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr className="border-t border-[var(--ar-border)]" data-row={row.key} key={row.key}>
                    <th className={`h-12 px-4 py-2 font-medium ${row.key === NONE_KEY ? "italic text-[var(--ar-text-muted)]" : ""}`} scope="row">
                      {row.label}
                    </th>
                    {visibleColumns.map((c: MoneyColumn) => (
                      <td className={`px-4 py-2 text-right tabular-nums ${c === "totalCostCents" ? "font-semibold" : ""}`} key={c}>
                        {money(row[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-[var(--ar-border-strong)] bg-[var(--ar-surface-muted)]">
                <tr>
                  <th className="px-4 py-3 font-semibold" scope="row">
                    {t("table.totals")}
                  </th>
                  {visibleColumns.map((c) => (
                    <td className="px-4 py-3 text-right font-semibold tabular-nums" key={c}>
                      {money(data.totals[c])}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </QueryState>
      {data === undefined ? null : (
        <p className="text-sm text-[var(--ar-text-muted)]">{t("counts", { workOrders: formatNumber(data.workOrderCount, locale), rentals: formatNumber(data.rentalCount, locale) })}</p>
      )}
    </div>
  );
}
