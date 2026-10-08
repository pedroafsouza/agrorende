import { z } from "zod";
import { HoldReasonEnum, PriorityEnum, SignatureStatusEnum, WorkOrderStatusEnum, WorkOrderTypeEnum } from "../enums.js";
import { ChecklistItemSchema, ChecklistResponseSchema } from "../checklist.js";
import { IntegerCentsSchema, IsoDateSchema, OptionalDateTimeSchema, OptionalIntegerCentsSchema, OptionalNumberSchema, OptionalStringSchema, OptionalUuidSchema, SyncDTOSchema, TableNameSchema, TABLE_ORDER, UuidSchema, type TableName } from "./shared.js";

export { TableNameSchema, TABLE_ORDER, type TableName };

export const WorkOrderSourceEnum = z.enum(["FIELD_REPORT", "DAMAGE", "MANUAL", "MAINTENANCE"]);
export type WorkOrderSource = z.infer<typeof WorkOrderSourceEnum>;

const WorkOrderCreateBaseSchema = z.object({
  priority: PriorityEnum,
  title: z.string().min(1),
  description: z.string().optional(),
  scheduledFor: z.string().date().nullable().optional(),
  assetId: z.string().uuid().optional(),
  siteId: z.string().uuid().optional(),
  plotId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  dueAt: z.string().datetime().optional(),
  destination: z.object({ lat: z.number(), lng: z.number(), note: z.string().optional() }).optional(),
  checklistTemplateId: z.string().uuid().optional(),
});

export const CreateWorkOrderInputSchema = z.discriminatedUnion("source", [
  WorkOrderCreateBaseSchema.extend({ source: z.literal("FIELD_REPORT"), type: WorkOrderTypeEnum.default("CORRECTIVE"), fieldReportId: z.string().uuid(), damageIds: z.array(z.string().uuid()).default([]) }),
  WorkOrderCreateBaseSchema.extend({ source: z.literal("DAMAGE"), type: WorkOrderTypeEnum.default("CORRECTIVE"), rentalId: z.string().uuid(), damageIds: z.array(z.string().uuid()).min(1) }),
  WorkOrderCreateBaseSchema.extend({ source: z.literal("MANUAL"), type: WorkOrderTypeEnum.default("CORRECTIVE"), damageIds: z.array(z.string().uuid()).default([]) }),
  WorkOrderCreateBaseSchema.extend({ source: z.literal("MAINTENANCE"), type: z.literal("PREVENTIVE"), maintenancePlanId: z.string().uuid(), damageIds: z.array(z.string().uuid()).default([]) }),
]);
export type CreateWorkOrderInput = z.infer<typeof CreateWorkOrderInputSchema>;

export const WorkOrderDTOSchema = SyncDTOSchema.extend({
  number: z.string(),
  type: WorkOrderTypeEnum,
  status: WorkOrderStatusEnum,
  priority: PriorityEnum,
  title: z.string(),
  description: OptionalStringSchema,
  scheduledFor: IsoDateSchema.nullish(),
  assetId: OptionalUuidSchema,
  siteId: OptionalUuidSchema,
  plotId: OptionalUuidSchema,
  customerId: OptionalUuidSchema,
  seasonId: OptionalUuidSchema,
  fieldReportId: OptionalUuidSchema,
  rentalId: OptionalUuidSchema,
  maintenancePlanId: OptionalUuidSchema,
  damageIds: z.array(UuidSchema),
  assigneeId: OptionalUuidSchema,
  previousAssigneeIds: z.array(UuidSchema),
  createdById: OptionalUuidSchema,
  dueAt: OptionalDateTimeSchema,
  slaAtRiskNotifiedAt: OptionalDateTimeSchema,
  slaBreachedAt: OptionalDateTimeSchema,
  destLat: OptionalNumberSchema,
  destLng: OptionalNumberSchema,
  locationNote: OptionalStringSchema,
  holdReason: HoldReasonEnum.nullish(),
  holdNote: OptionalStringSchema,
  checklistTemplateId: OptionalUuidSchema,
  checklistTemplateVersion: z.number().int().nullish(),
  checklistSnapshot: z.array(ChecklistItemSchema).nullish(),
  checklistResponses: z.array(ChecklistResponseSchema),
  resolution: OptionalStringSchema,
  documentLocale: z.string(),
  rootCause: OptionalStringSchema,
  hourMeterReading: OptionalNumberSchema,
  customerSignerName: OptionalStringSchema,
  signatureStatus: SignatureStatusEnum.nullish(),
  signatureReason: OptionalStringSchema,
  signatureWitnessName: OptionalStringSchema,
  signatureMediaId: OptionalUuidSchema,
  clockOffsetMs: z.number().int().nullish(),
  assignedAt: OptionalDateTimeSchema,
  acceptedAt: OptionalDateTimeSchema,
  enRouteAt: OptionalDateTimeSchema,
  arrivedAt: OptionalDateTimeSchema,
  startedAt: OptionalDateTimeSchema,
  completedAt: OptionalDateTimeSchema,
  verifiedAt: OptionalDateTimeSchema,
  verifiedById: OptionalUuidSchema,
  cancelledAt: OptionalDateTimeSchema,
  cancelReason: OptionalStringSchema,
  travelMinutes: z.number().int().nullish(),
  workMinutes: z.number().int().nullish(),
  laborCostCents: OptionalIntegerCentsSchema,
  partsCostCents: OptionalIntegerCentsSchema,
  externalCostCents: OptionalIntegerCentsSchema,
  externalCostNote: OptionalStringSchema,
  hasLateEvidence: z.boolean(),
});
export type WorkOrderDTO = z.infer<typeof WorkOrderDTOSchema>;

export const WorkOrderBillingPartSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  unit: z.string(),
  unitCostCents: IntegerCentsSchema.nullish(),
});
export type WorkOrderBillingPart = z.infer<typeof WorkOrderBillingPartSchema>;
