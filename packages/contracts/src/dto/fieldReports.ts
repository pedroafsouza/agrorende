import { z } from "zod";
import { FieldReportStatusEnum, IssueCategoryEnum, PriorityEnum, SuggestedActionEnum } from "../enums";
import { JsonSchema, OptionalDateTimeSchema, OptionalNumberSchema, OptionalStringSchema, OptionalUuidSchema, SyncDTOSchema, UuidSchema } from "./shared";

export const FieldReportDTOSchema = SyncDTOSchema.extend({
  number: OptionalStringSchema,
  reporterId: UuidSchema,
  assetId: OptionalUuidSchema,
  unregisteredAssetDesc: OptionalStringSchema,
  siteId: OptionalUuidSchema,
  plotId: OptionalUuidSchema,
  seasonId: OptionalUuidSchema,
  rentalId: OptionalUuidSchema,
  damageId: OptionalUuidSchema,
  category: IssueCategoryEnum,
  priority: PriorityEnum,
  machineOperable: z.boolean(),
  suggestedAction: SuggestedActionEnum,
  title: z.string(),
  description: OptionalStringSchema,
  status: FieldReportStatusEnum,
  statusReason: OptionalStringSchema,
  lat: OptionalNumberSchema,
  lng: OptionalNumberSchema,
  accuracyM: OptionalNumberSchema,
  occurredAt: z.string().datetime(),
  receivedAt: z.string().datetime(),
  reviewedById: OptionalUuidSchema,
  reviewedAt: OptionalDateTimeSchema,
  workOrderId: OptionalUuidSchema,
  flags: JsonSchema,
});
export type FieldReportDTO = z.infer<typeof FieldReportDTOSchema>;
