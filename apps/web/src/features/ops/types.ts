import type {
  AlertType,
  KpiKey,
  KpiRange,
  LiveAssetDTO,
  LiveOperatorDTO,
  LiveRentalDTO,
  LiveReportDTO,
  LiveWorkOrderDTO,
  OperatorTrailDTO,
  OpsActivityDTO,
  OpsActivityItemDTO,
  OpsAlertDTO,
  OpsAlertsDTO,
  OpsKpisDTO,
  OpsLiveDTO,
  TrailPointDTO,
} from "@agrorende/core/modules/ops/dto";

export type {
  AlertType,
  KpiKey,
  KpiRange,
  LiveAssetDTO,
  LiveOperatorDTO,
  LiveRentalDTO,
  LiveReportDTO,
  LiveWorkOrderDTO,
  OperatorTrailDTO,
  OpsActivityDTO,
  OpsActivityItemDTO,
  OpsAlertDTO,
  OpsAlertsDTO,
  OpsKpisDTO,
  OpsLiveDTO,
  TrailPointDTO,
};

/** Mirrors core `KPI_KEYS`; kept local so the client bundle never pulls core runtime code. */
export const KPI_KEYS: readonly KpiKey[] = ["open_reports", "unassigned_wos", "in_progress", "done_today", "sla_at_risk", "active_rentals", "overdue_rentals", "on_duty"];

export function isKpiKey(value: string | null | undefined): value is KpiKey {
  return typeof value === "string" && (KPI_KEYS as readonly string[]).includes(value);
}

export const OPS_QUERY_KEYS = {
  live: ["ops", "live"] as const,
  kpis: (range: string) => ["ops", "kpis", range] as const,
  alerts: ["ops", "alerts"] as const,
  activity: ["ops", "activity"] as const,
  trail: (userId: string) => ["ops", "trail", userId] as const,
  boundaries: ["ops", "boundaries"] as const,
};
