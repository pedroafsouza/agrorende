import { z } from "zod";
import { DamageDisputeStatusEnum, DamageMatchStatusEnum, DamageSeverityEnum, DamageZoneEnum } from "../enums";
import { OptionalDateTimeSchema, OptionalIntegerCentsSchema, OptionalStringSchema, OptionalUuidSchema, SyncDTOSchema, UuidSchema } from "./shared";

export const DamageDTOSchema = SyncDTOSchema.extend({
  assetId: UuidSchema,
  zone: DamageZoneEnum,
  severity: DamageSeverityEnum,
  description: OptionalStringSchema,
  isPreExisting: z.boolean(),
  detectedInspectionId: OptionalUuidSchema,
  detectedRentalId: OptionalUuidSchema,
  matchedDamageId: OptionalUuidSchema,
  matchStatus: DamageMatchStatusEnum,
  disputeStatus: DamageDisputeStatusEnum,
  customerStatement: OptionalStringSchema,
  fieldReportId: OptionalUuidSchema,
  estimatedCostCents: OptionalIntegerCentsSchema,
  reportedById: UuidSchema,
  repairedAt: OptionalDateTimeSchema,
  repairedWorkOrderId: OptionalUuidSchema,
});
export type DamageDTO = z.infer<typeof DamageDTOSchema>;
