import { z } from "zod";
import { AssetCategoryEnum, MaintenanceTriggerEnum } from "../enums.js";
import { OptionalDateTimeSchema, OptionalNumberSchema, OptionalUuidSchema, SyncDTOSchema } from "./shared.js";

export const MaintenancePlanDTOSchema = SyncDTOSchema.extend({
  name: z.string(),
  assetId: OptionalUuidSchema,
  assetCategory: AssetCategoryEnum.nullish(),
  trigger: MaintenanceTriggerEnum,
  intervalHours: OptionalNumberSchema,
  intervalDays: z.number().int().nullish(),
  lastDoneHourMeter: OptionalNumberSchema,
  lastDoneAt: OptionalDateTimeSchema,
  nextDueHourMeter: OptionalNumberSchema,
  nextDueAt: OptionalDateTimeSchema,
  leadHours: z.number(),
  leadDays: z.number().int(),
  checklistTemplateId: OptionalUuidSchema,
  isActive: z.boolean(),
});
export type MaintenancePlanDTO = z.infer<typeof MaintenancePlanDTOSchema>;
