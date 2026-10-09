import type { AnalyticsDTO, AnalyticsMetric } from "@agrorende/core/modules/ops/analytics";

import { api } from "@/lib/api";

export type {
  AnalyticsDTO,
  AnalyticsMetric,
  AnalyticsPoint,
  AnalyticsUnit,
} from "@agrorende/core/modules/ops/analytics";

/** The operations tab, in display order; mirrors core `ANALYTICS_METRICS` without the cost metric. */
export const OPERATIONS_METRICS = [
  "mttr",
  "first_time_fix",
  "reports_by_category",
  "wos_by_field_user",
  "downtime",
  "top_failing",
  "rental_utilization",
  "rental_revenue",
] as const satisfies readonly AnalyticsMetric[];

/** Groupings offered by the cost dashboard tab (T16.2): machine, farm and season. */
export const COST_DASHBOARD_GROUPS = ["asset", "site", "season"] as const;
export type CostDashboardGroup = (typeof COST_DASHBOARD_GROUPS)[number];

export interface AnalyticsFilters {
  readonly from: string;
  readonly to: string;
  readonly seasonId: string;
}

export const analyticsApi = {
  metric: (
    metric: AnalyticsMetric,
    filters: AnalyticsFilters & { readonly groupBy?: string },
    locale: string,
    signal?: AbortSignal,
  ) =>
    api<AnalyticsDTO>("/ops/analytics", {
      query: {
        metric,
        from: filters.from,
        to: filters.to,
        seasonId: filters.seasonId,
        groupBy: filters.groupBy,
        locale,
      },
      ...(signal === undefined ? {} : { signal }),
    }),
};
