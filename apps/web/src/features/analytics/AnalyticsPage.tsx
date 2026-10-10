"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart3, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, type KeyboardEvent } from "react";

import type { SeasonDTO } from "@agrorende/contracts/dto";

import { PageHeader } from "@/components/shell/PageHeader";
import { Field, Input, Select } from "@/components/ui/Field";
import { api } from "@/lib/api";
import type { ListPage } from "@/lib/forms";
import { useUrlState } from "@/lib/url-state";

import {
  COST_DASHBOARD_GROUPS,
  OPERATIONS_METRICS,
  type AnalyticsFilters,
  type CostDashboardGroup,
} from "./api";
import { CostDashboard } from "./CostDashboard";
import { MetricCard } from "./MetricCard";

const TABS = ["operations", "costs"] as const;
type Tab = (typeof TABS)[number];
const URL_KEYS = ["tab", "from", "to", "seasonId", "groupBy"] as const;
const URL_DEFAULTS = { tab: "operations", groupBy: "asset" };
const TAB_ICONS = { operations: BarChart3, costs: Wallet } as const;

/** `/analytics` (T16.2): operations metrics of ARCHITECTURE §6.4 and the cost dashboard tab. */
export function AnalyticsPage() {
  const t = useTranslations("analytics");
  const [state, setState] = useUrlState(URL_KEYS, URL_DEFAULTS);
  const tab: Tab = (TABS as readonly string[]).includes(state.tab)
    ? (state.tab as Tab)
    : "operations";
  const groupBy: CostDashboardGroup = (COST_DASHBOARD_GROUPS as readonly string[]).includes(
    state.groupBy,
  )
    ? (state.groupBy as CostDashboardGroup)
    : "asset";
  const filters: AnalyticsFilters = useMemo(
    () => ({ from: state.from, to: state.to, seasonId: state.seasonId }),
    [state.from, state.to, state.seasonId],
  );
  const seasons = useQuery({
    queryKey: ["seasons"],
    queryFn: () => api<ListPage<SeasonDTO>>("/seasons"),
    retry: false,
  });

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    // Move from the tab that has focus, which can differ from the selected one while the URL updates.
    const focused = TABS.find((candidate) => event.currentTarget.id === `analytics-tab-${candidate}`) ?? tab;
    const next =
      TABS[
        (TABS.indexOf(focused) + (event.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length
      ] ?? "operations";
    setState({ tab: next });
    document.getElementById(`analytics-tab-${next}`)?.focus();
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader subtitle={t("subtitle")} title={t("title")} />
      <form
        aria-label={t("filters.label")}
        className="grid gap-3 sm:grid-cols-3"
        onSubmit={(e) => e.preventDefault()}
        role="search"
      >
        <Field label={t("filters.from")}>
          {(props) => (
            <Input
              {...props}
              onChange={(e) => setState({ from: e.target.value })}
              type="date"
              value={state.from}
            />
          )}
        </Field>
        <Field label={t("filters.to")}>
          {(props) => (
            <Input
              {...props}
              onChange={(e) => setState({ to: e.target.value })}
              type="date"
              value={state.to}
            />
          )}
        </Field>
        <Field label={t("filters.season")}>
          {(props) => (
            <Select
              {...props}
              onChange={(e) => setState({ seasonId: e.target.value })}
              value={state.seasonId}
            >
              <option value="">{t("filters.allSeasons")}</option>
              {(seasons.data?.items ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </form>
      <p className="text-sm text-[var(--ar-text-muted)]">
        {state.from === "" && state.to === "" && state.seasonId === ""
          ? t("filters.defaultRange")
          : t("filters.timezone")}
      </p>
      <div
        aria-label={t("tabs.label")}
        className="flex gap-2 border-b border-[var(--ar-border)]"
        role="tablist"
      >
        {TABS.map((id) => {
          const Icon = TAB_ICONS[id];
          const selected = id === tab;
          return (
            <button
              aria-controls={`analytics-panel-${id}`}
              aria-selected={selected}
              className={`-mb-px flex min-h-12 items-center gap-2 border-b-2 px-4 font-semibold ${selected ? "border-[var(--ar-primary)] text-[var(--ar-text)]" : "border-transparent text-[var(--ar-text-muted)]"}`}
              id={`analytics-tab-${id}`}
              key={id}
              onClick={() => setState({ tab: id })}
              onKeyDown={onTabKey}
              role="tab"
              tabIndex={selected ? 0 : -1}
              type="button"
            >
              <Icon aria-hidden="true" className="size-4" />
              {t(`tabs.${id}`)}
            </button>
          );
        })}
      </div>
      <div aria-labelledby={`analytics-tab-${tab}`} id={`analytics-panel-${tab}`} role="tabpanel">
        {tab === "operations" ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {OPERATIONS_METRICS.map((metric) => (
              <MetricCard filters={filters} key={metric} metric={metric} />
            ))}
          </div>
        ) : (
          <CostDashboard
            filters={filters}
            groupBy={groupBy}
            onGroupBy={(group) => setState({ groupBy: group })}
          />
        )}
      </div>
    </div>
  );
}
