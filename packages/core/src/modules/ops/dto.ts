import type { DutyStatus, Priority, RentalDirection, WorkOrderStatus, FieldReportStatus, AssetCondition, EntityType } from "@agrorende/contracts/enums";
import { AlertTypeEnum, AttentionKindEnum, KpiKeyEnum, KpiRangeEnum, type AlertType, type AttentionKind, type KpiKey, type KpiRange, type SlaState } from "@agrorende/contracts/dto";
import type { OperatorState } from "@agrorende/contracts/realtime";

/**
 * Ops Center read models (ARCHITECTURE §8 Ops, §14.3). The zod schemas live in
 * `@agrorende/contracts/dto` (`dto/ops.ts`, change request T09-001); these readonly interfaces
 * mirror them field for field for the core services.
 */

export type { AlertType, AttentionKind, KpiKey, KpiRange, SlaState };

export const KPI_KEYS = KpiKeyEnum.options;
export const KPI_RANGES = KpiRangeEnum.options;

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

export const ALERT_TYPES = AlertTypeEnum.options;

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

export const ATTENTION_KINDS = AttentionKindEnum.options;

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
