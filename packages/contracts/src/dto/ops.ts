import { z } from "zod";

import { AssetConditionEnum, DutyStatusEnum, EntityTypeEnum, FieldReportStatusEnum, PriorityEnum, RentalDirectionEnum, WorkOrderStatusEnum } from "../enums.js";
import { OperatorStateEnum } from "../realtime.js";
import { IsoDateTimeSchema } from "./shared.js";

/** Ops Center read models (ARCHITECTURE §8 Ops, §14.3; change request T09-001). */

export const SlaStateEnum = z.enum(["OK", "AT_RISK", "BREACHED"]);
export type SlaState = z.infer<typeof SlaStateEnum>;

export const KpiKeyEnum = z.enum(["open_reports", "unassigned_wos", "in_progress", "done_today", "sla_at_risk", "active_rentals", "overdue_rentals", "on_duty"]);
export type KpiKey = z.infer<typeof KpiKeyEnum>;

export const KpiRangeEnum = z.enum(["today", "7d", "30d"]);
export type KpiRange = z.infer<typeof KpiRangeEnum>;

export const AlertTypeEnum = z.enum(["SLA_BREACHED", "SLA_AT_RISK", "OVERDUE_RENTAL", "CRITICAL_UNASSIGNED_REPORT", "STALE_DEVICE"]);
export type AlertType = z.infer<typeof AlertTypeEnum>;

export const AttentionKindEnum = z.enum(["REJECTED_MUTATION", "MEDIA_PENDING", "STALE_DEVICE", "DIAGNOSTIC"]);
export type AttentionKind = z.infer<typeof AttentionKindEnum>;

const ParamsSchema = z.record(z.string(), z.union([z.string(), z.number(), z.null()]));

export const OpsKpisDTOSchema = z.object({
  range: KpiRangeEnum,
  generatedAt: IsoDateTimeSchema,
  counts: z.record(KpiKeyEnum, z.number()),
  slaBreached: z.number(),
  slaCompliancePct: z.number().nullable(),
  mttrHours: z.number().nullable(),
  utilizationPct: z.number().nullable(),
});

export const LiveOperatorDTOSchema = z.object({
  userId: z.string(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  accuracyM: z.number().nullable(),
  heading: z.number().nullable(),
  speedMps: z.number().nullable(),
  recordedAt: IsoDateTimeSchema,
  lastSeenAt: IsoDateTimeSchema.nullable(),
  dutyStatus: DutyStatusEnum,
  state: OperatorStateEnum,
  stale: z.boolean(),
  deviceId: z.string().nullable(),
  activeWorkOrderId: z.string().nullable(),
});

export const LiveWorkOrderDTOSchema = z.object({
  id: z.string(),
  number: z.string(),
  title: z.string(),
  status: WorkOrderStatusEnum,
  priority: PriorityEnum,
  assigneeId: z.string().nullable(),
  assetId: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  dueAt: IsoDateTimeSchema.nullable(),
  sla: SlaStateEnum.nullable(),
});

export const LiveReportDTOSchema = z.object({
  id: z.string(),
  number: z.string().nullable(),
  title: z.string(),
  status: FieldReportStatusEnum,
  priority: PriorityEnum,
  machineOperable: z.boolean(),
  critical: z.boolean(),
  assetId: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  receivedAt: IsoDateTimeSchema,
});

export const LiveRentalDTOSchema = z.object({
  id: z.string(),
  number: z.string(),
  direction: RentalDirectionEnum,
  assetId: z.string(),
  customerId: z.string(),
  plannedEnd: IsoDateTimeSchema,
  overdue: z.boolean(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
});

export const LiveAssetDTOSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  condition: AssetConditionEnum,
  rentedOut: z.boolean(),
  lat: z.number(),
  lng: z.number(),
});

export const OpsLiveDTOSchema = z.object({
  generatedAt: IsoDateTimeSchema,
  operators: z.array(LiveOperatorDTOSchema),
  workOrders: z.array(LiveWorkOrderDTOSchema),
  reports: z.array(LiveReportDTOSchema),
  rentals: z.array(LiveRentalDTOSchema),
  assets: z.array(LiveAssetDTOSchema),
});

export type LiveOperatorDTO = z.infer<typeof LiveOperatorDTOSchema>;
export type LiveWorkOrderDTO = z.infer<typeof LiveWorkOrderDTOSchema>;
export type LiveReportDTO = z.infer<typeof LiveReportDTOSchema>;
export type LiveRentalDTO = z.infer<typeof LiveRentalDTOSchema>;
export type LiveAssetDTO = z.infer<typeof LiveAssetDTOSchema>;
export type OpsLiveDTO = z.infer<typeof OpsLiveDTOSchema>;

export const OpsAlertDTOSchema = z.object({
  id: z.string(),
  type: AlertTypeEnum,
  severity: z.enum(["critical", "warning"]),
  entityType: EntityTypeEnum,
  entityId: z.string(),
  label: z.string(),
  at: IsoDateTimeSchema,
  params: ParamsSchema,
});

export const OpsAlertsDTOSchema = z.object({ generatedAt: IsoDateTimeSchema, items: z.array(OpsAlertDTOSchema) });

export const OpsActivityItemDTOSchema = z.object({
  id: z.string(),
  entityType: EntityTypeEnum,
  entityId: z.string(),
  action: z.string(),
  fromStatus: z.string().nullable(),
  toStatus: z.string().nullable(),
  actorId: z.string().nullable(),
  actorName: z.string().nullable(),
  occurredAt: IsoDateTimeSchema,
  meta: z.record(z.string(), z.unknown()),
});

export const OpsActivityDTOSchema = z.object({ items: z.array(OpsActivityItemDTOSchema), nextCursor: z.string().nullable() });

export const TrailPointDTOSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  recordedAt: IsoDateTimeSchema,
  accuracyM: z.number().nullable(),
  speedMps: z.number().nullable(),
  heading: z.number().nullable(),
});

export const OperatorTrailDTOSchema = z.object({
  userId: z.string(),
  from: IsoDateTimeSchema,
  to: IsoDateTimeSchema,
  points: z.array(TrailPointDTOSchema),
});

export const AttentionItemDTOSchema = z.object({
  kind: AttentionKindEnum,
  id: z.string(),
  at: IsoDateTimeSchema,
  userId: z.string().nullable(),
  userName: z.string().nullable(),
  deviceId: z.string().nullable(),
  params: ParamsSchema,
});

export const AttentionListDTOSchema = z.object({ items: z.array(AttentionItemDTOSchema) });

export const AttentionResolveInputSchema = z.object({ note: z.string().trim().min(1).max(1000) });
export type AttentionResolveInput = z.infer<typeof AttentionResolveInputSchema>;

export const AttentionResolutionDTOSchema = z.object({
  kind: AttentionKindEnum,
  id: z.string(),
  resolvedAt: IsoDateTimeSchema,
  resolvedById: z.string(),
  resolverName: z.string().nullable(),
  note: z.string(),
});
