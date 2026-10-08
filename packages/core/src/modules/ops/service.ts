/**
 * Ops module service surface (F4 Operations Center, ARCHITECTURE §8 Ops and §21.2 Needs attention).
 * The module is read-only reporting except for attention resolutions.
 */
export { getAlerts, getKpis, getLive, getOperatorTrail, listActivity, loadOpsSettings, parseKpiRange, type OpsCtx, type OpsDeps } from "./queries.js";
export { listAttention, parseAttentionKind, resolveAttention, resolutionId, ATTENTION_RESOLVED_ACTION, type AttentionCtx } from "./attention.js";
export { slaStateOf, isRentalOverdue, isOperatorStale, opsSettingsOf, startOfZonedDay, type OpsSettings } from "./rules.js";
export type * from "./dto.js";
