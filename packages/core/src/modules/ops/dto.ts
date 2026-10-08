import type { DutyStatus, Priority, RentalDirection, WorkOrderStatus, FieldReportStatus, AssetCondition, EntityType } from "@agrorende/contracts/enums";
import type { OperatorState } from "@agrorende/contracts/realtime";

/**
 * Ops Center read models (ARCHITECTURE §8 Ops, §14.3). Contracts has no `dto/ops.ts` yet, so the
 * wire shapes live here until change request T09-001 lands them in `@agrorende/contracts`.
 */

export type SlaState = "OK" | "AT_RISK" | "BREACHED";

export const KPI_KEYS = [
  "open_reports",
  "unassigned_wos",
  "in_progress",
  "done_today",
  "sla_at_risk",
  "active_rentals",
  "overdue_rentals",
  "on_duty",
] as const;
export type KpiKey = (typeof KPI_KEYS)[number];

export const KPI_RANGES = ["today", "7d", "30d"] as const;
export type KpiRange = (typeof KPI_RANGES)[number];

export interface OpsKpisDTO {
  readonly range: KpiRange;
  readonly generatedAt: string;
  readonly counts: Readonly<Record<KpiKey, number>>;
  readonly slaBreached: number;
  /** Share (0–100) of WOs completed in the range on or before `dueAt`; null without data. */
  readonly slaCompliancePct: number | null;
  /** Median hours from creation to completion of WOs completed in the range. */
  readonly mttrHours: number | null;
  /** Share (0–100) of rentable assets that are rented out right now. */
  readonly utilizationPct: number | null;
}

export interface LiveOperatorDTO {
  readonly userId: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly accuracyM: number | null;
  readonly heading: number | null;
  readonly speedMps: number | null;
  readonly recordedAt: string;
  readonly lastSeenAt: string | null;
  readonly dutyStatus: DutyStatus;
  readonly state: OperatorState;
  /** No fix or presence for more than 5 minutes (EC-OPS-20). */
  readonly stale: boolean;
  readonly deviceId: string | null;
  readonly activeWorkOrderId: string | null;
}

export interface LiveWorkOrderDTO {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly status: WorkOrderStatus;
  readonly priority: Priority;
  readonly assigneeId: string | null;
  readonly assetId: string | null;
  readonly lat: number;
  readonly lng: number;
  readonly dueAt: string | null;
  readonly sla: SlaState | null;
}

export interface LiveReportDTO {
  readonly id: string;
  readonly number: string | null;
  readonly title: string;
  readonly status: FieldReportStatus;
  readonly priority: Priority;
  readonly machineOperable: boolean;
  readonly critical: boolean;
  readonly assetId: string | null;
  readonly lat: number;
  readonly lng: number;
  readonly receivedAt: string;
}

export interface LiveRentalDTO {
  readonly id: string;
  readonly number: string;
  readonly direction: RentalDirection;
  readonly assetId: string;
  readonly customerId: string;
  readonly plannedEnd: string;
  readonly overdue: boolean;
  readonly lat: number | null;
  readonly lng: number | null;
}

export interface LiveAssetDTO {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly condition: AssetCondition;
  readonly rentedOut: boolean;
  readonly lat: number;
  readonly lng: number;
}

export interface OpsLiveDTO {
  readonly generatedAt: string;
  readonly operators: readonly LiveOperatorDTO[];
  readonly workOrders: readonly LiveWorkOrderDTO[];
  readonly reports: readonly LiveReportDTO[];
  readonly rentals: readonly LiveRentalDTO[];
  readonly assets: readonly LiveAssetDTO[];
}

export const ALERT_TYPES = ["SLA_BREACHED", "SLA_AT_RISK", "OVERDUE_RENTAL", "CRITICAL_UNASSIGNED_REPORT", "STALE_DEVICE"] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export interface OpsAlertDTO {
  readonly id: string;
  readonly type: AlertType;
  readonly severity: "critical" | "warning";
  readonly entityType: EntityType;
  readonly entityId: string;
  readonly label: string;
  /** When the condition started (due date, planned end, receipt or last sync). */
  readonly at: string;
  readonly params: Readonly<Record<string, string | number | null>>;
}

export interface OpsAlertsDTO {
  readonly generatedAt: string;
  readonly items: readonly OpsAlertDTO[];
}

export interface OpsActivityItemDTO {
  readonly id: string;
  readonly entityType: EntityType;
  readonly entityId: string;
  readonly action: string;
  readonly fromStatus: string | null;
  readonly toStatus: string | null;
  readonly actorId: string | null;
  readonly actorName: string | null;
  readonly occurredAt: string;
  readonly meta: Readonly<Record<string, unknown>>;
}

export interface OpsActivityDTO {
  readonly items: readonly OpsActivityItemDTO[];
  readonly nextCursor: string | null;
}

export interface TrailPointDTO {
  readonly lat: number;
  readonly lng: number;
  readonly recordedAt: string;
  readonly accuracyM: number | null;
  readonly speedMps: number | null;
  readonly heading: number | null;
}

export interface OperatorTrailDTO {
  readonly userId: string;
  readonly from: string;
  readonly to: string;
  readonly points: readonly TrailPointDTO[];
}

export const ATTENTION_KINDS = ["REJECTED_MUTATION", "MEDIA_PENDING", "STALE_DEVICE", "DIAGNOSTIC"] as const;
export type AttentionKind = (typeof ATTENTION_KINDS)[number];

export interface AttentionItemDTO {
  readonly kind: AttentionKind;
  readonly id: string;
  readonly at: string;
  readonly userId: string | null;
  readonly userName: string | null;
  readonly deviceId: string | null;
  readonly params: Readonly<Record<string, string | number | null>>;
}

export interface AttentionListDTO {
  readonly items: readonly AttentionItemDTO[];
}

export interface AttentionResolutionDTO {
  readonly kind: AttentionKind;
  readonly id: string;
  readonly resolvedAt: string;
  readonly resolvedById: string;
  readonly resolverName: string | null;
  readonly note: string;
}

/** @deprecated T01 skeleton placeholder kept for older imports. */
export interface OpsDTO {
  readonly id: string;
  readonly organizationId: string;
}
