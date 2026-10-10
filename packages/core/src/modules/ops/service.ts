/**
 * Ops module service surface (F4 Operations Center, ARCHITECTURE §8 Ops and §21.2 Needs attention).
 * The module is read-only reporting except for attention resolutions.
 */
export { getAlerts, getKpis, getLive, getOperatorTrail, listActivity, loadOpsSettings, parseKpiRange, type OpsCtx, type OpsDeps } from "./queries";
export { listAttention, parseAttentionKind, resolveAttention, resolutionId, ATTENTION_RESOLVED_ACTION, type AttentionCtx } from "./attention";
export { slaStateOf, isRentalOverdue, isOperatorStale, opsSettingsOf, startOfZonedDay, type OpsSettings } from "./rules";
export type * from "./dto";
export { getAnalytics, parseAnalyticsMetric, weekKey, ANALYTICS_METRICS, type AnalyticsCtx, type AnalyticsDTO, type AnalyticsFilters, type AnalyticsMetric, type AnalyticsPoint, type AnalyticsUnit } from "./analytics";
export { search, SEARCH_LIMIT, SEARCH_MIN_LENGTH, SEARCH_TYPES, type SearchHitDTO, type SearchResultsDTO, type SearchType } from "./search";
export { plotBoundaries, type PlotBoundariesDTO, type PlotBoundaryFeature } from "./boundaries";
