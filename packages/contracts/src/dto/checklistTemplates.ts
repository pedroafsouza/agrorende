import { z } from "zod";
import { AssetCategoryEnum, ChecklistKindEnum } from "../enums.js";
import { AccessoryDefSchema, ChecklistItemSchema } from "../checklist.js";
import { OptionalDateTimeSchema, SyncDTOSchema } from "./shared.js";

export const ChecklistTemplateDTOSchema = SyncDTOSchema.extend({
  name: z.string(),
  appliesTo: z.array(ChecklistKindEnum),
  assetCategories: z.array(AssetCategoryEnum),
  templateVersion: z.number().int(),
  items: z.array(ChecklistItemSchema),
  accessories: z.array(AccessoryDefSchema),
  isActive: z.boolean(),
  archivedAt: OptionalDateTimeSchema,
});
export type ChecklistTemplateDTO = z.infer<typeof ChecklistTemplateDTOSchema>;
export type ChecklistSnapshot = z.infer<typeof ChecklistTemplateDTOSchema>;
