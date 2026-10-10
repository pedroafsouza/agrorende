import { z } from "zod";
import { AssetCategoryEnum, ChecklistKindEnum } from "../enums";
import { AccessoryDefSchema, ChecklistItemSchema } from "../checklist";
import { OptionalDateTimeSchema, SyncDTOSchema } from "./shared";

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
