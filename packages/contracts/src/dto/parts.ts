import { z } from "zod";
import { AssetCategoryEnum } from "../enums";
import { OptionalDateTimeSchema, OptionalNumberSchema, OptionalIntegerCentsSchema, SyncDTOSchema } from "./shared";

export const PartDTOSchema = SyncDTOSchema.extend({
  sku: z.string(),
  name: z.string(),
  unit: z.string(),
  unitCostCents: OptionalIntegerCentsSchema,
  compatibleCategories: z.array(AssetCategoryEnum),
  minStock: OptionalNumberSchema,
  isActive: z.boolean(),
  archivedAt: OptionalDateTimeSchema,
});
export type PartDTO = z.infer<typeof PartDTOSchema>;
