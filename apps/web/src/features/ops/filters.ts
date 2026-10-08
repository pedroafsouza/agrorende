import type { OperatorMarker } from "./operatorStore";
import type { AlertType, KpiKey, LiveAssetDTO, LiveRentalDTO, LiveReportDTO, LiveWorkOrderDTO, OpsAlertDTO, TrailPointDTO } from "./types";

export const MAP_LAYERS = ["operators", "reports", "workOrders", "assets", "rentals"] as const;
export type MapLayerKey = (typeof MAP_LAYERS)[number];

export interface OpsView {
  readonly operators: readonly OperatorMarker[];
  readonly reports: readonly LiveReportDTO[];
  readonly workOrders: readonly LiveWorkOrderDTO[];
  readonly assets: readonly LiveAssetDTO[];
  readonly rentals: readonly LiveRentalDTO[];
}

const WORKING = new Set(["EN_ROUTE", "ON_SITE", "IN_PROGRESS", "ON_HOLD"]);

/** Which alert types stay in the side list for each KPI filter; null keeps every alert. */
const KPI_ALERTS: Readonly<Partial<Record<KpiKey, readonly AlertType[]>>> = {
  open_reports: ["CRITICAL_UNASSIGNED_REPORT"],
  unassigned_wos: ["SLA_AT_RISK", "SLA_BREACHED"],
  sla_at_risk: ["SLA_AT_RISK", "SLA_BREACHED"],
  active_rentals: ["OVERDUE_RENTAL"],
  overdue_rentals: ["OVERDUE_RENTAL"],
  on_duty: ["STALE_DEVICE"],
};

/** KPI click = URL filter (`?kpi=`) applied to the map layers and the side lists (A§14.3). */
export function applyKpiFilter(view: OpsView, kpi: KpiKey | null): OpsView {
  if (kpi === null) return view;
  const none = { operators: [], reports: [], workOrders: [], assets: [], rentals: [] };
  switch (kpi) {
    case "open_reports":
      return { ...none, reports: view.reports };
    case "unassigned_wos":
      return { ...none, workOrders: view.workOrders.filter((w) => w.assigneeId === null) };
    case "in_progress":
      return { ...none, workOrders: view.workOrders.filter((w) => WORKING.has(w.status)), operators: view.operators.filter((o) => o.activeWorkOrderId !== null) };
    case "done_today":
      return { ...none, operators: view.operators };
    case "sla_at_risk":
      return { ...none, workOrders: view.workOrders.filter((w) => w.sla === "AT_RISK" || w.sla === "BREACHED") };
    case "active_rentals":
      return { ...none, rentals: view.rentals };
    case "overdue_rentals":
      return { ...none, rentals: view.rentals.filter((r) => r.overdue) };
    case "on_duty":
      return { ...none, operators: view.operators.filter((o) => o.dutyStatus === "ON_DUTY") };
    default:
      return view;
  }
}

export function filterAlerts(alerts: readonly OpsAlertDTO[], kpi: KpiKey | null): readonly OpsAlertDTO[] {
  const types = kpi === null ? undefined : KPI_ALERTS[kpi];
  return types === undefined ? alerts : alerts.filter((a) => types.includes(a.type));
}

/** Groups larger than this collapse behind one header (EC-OPS-21); nothing is dropped. */
export const ALERT_GROUP_THRESHOLD = 3;

export interface AlertGroup {
  readonly type: AlertType;
  readonly severity: "critical" | "warning";
  readonly items: readonly OpsAlertDTO[];
  readonly collapsible: boolean;
}

const SEVERITY_ORDER: Readonly<Record<AlertType, number>> = {
  SLA_BREACHED: 0,
  CRITICAL_UNASSIGNED_REPORT: 1,
  OVERDUE_RENTAL: 2,
  SLA_AT_RISK: 3,
  STALE_DEVICE: 4,
};

export function groupAlerts(alerts: readonly OpsAlertDTO[]): readonly AlertGroup[] {
  const groups = new Map<AlertType, OpsAlertDTO[]>();
  for (const alert of alerts) {
    const list = groups.get(alert.type) ?? [];
    list.push(alert);
    groups.set(alert.type, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => SEVERITY_ORDER[a] - SEVERITY_ORDER[b])
    .map(([type, items]) => ({
      type,
      severity: items.some((i) => i.severity === "critical") ? "critical" : "warning",
      items,
      collapsible: items.length > ALERT_GROUP_THRESHOLD,
    }));
}

/** Trail gaps longer than this (buffer trimming, phone off) break the line instead of drawing a straight jump. */
export const TRAIL_GAP_MS = 10 * 60_000;

export function trailSegments(points: readonly TrailPointDTO[], gapMs = TRAIL_GAP_MS): readonly (readonly [number, number])[][] {
  const sorted = [...points].sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
  const segments: [number, number][][] = [];
  let current: [number, number][] = [];
  let previous: number | null = null;
  for (const p of sorted) {
    const at = Date.parse(p.recordedAt);
    if (previous !== null && at - previous > gapMs && current.length > 0) {
      segments.push(current);
      current = [];
    }
    current.push([p.lng, p.lat]);
    previous = at;
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

export function trailHasGaps(points: readonly TrailPointDTO[], gapMs = TRAIL_GAP_MS): boolean {
  return trailSegments(points, gapMs).length > 1;
}
