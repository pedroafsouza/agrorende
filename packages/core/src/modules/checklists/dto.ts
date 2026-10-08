import { z } from "zod";
import { AccessoryDefSchema, ChecklistItemSchema } from "@agrorende/contracts/checklist";
import { AssetCategoryEnum, ChecklistKindEnum } from "@agrorende/contracts/enums";

export type { ChecklistSnapshot, ChecklistTemplateDTO } from "@agrorende/contracts/dto";

const Items = z
  .array(ChecklistItemSchema)
  .min(1)
  .refine((items) => new Set(items.map((item) => item.key)).size === items.length, { message: "duplicateKey" });

export const TemplateCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  appliesTo: z.array(ChecklistKindEnum).min(1),
  assetCategories: z.array(AssetCategoryEnum).default([]),
  items: Items,
  accessories: z.array(AccessoryDefSchema).default([]),
  isActive: z.boolean().default(true),
});
export type TemplateCreateInput = z.input<typeof TemplateCreateInputSchema>;

/** Metadata edits do not change what technicians fill in, so they keep the version. */
export const TemplateUpdateInputSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  appliesTo: z.array(ChecklistKindEnum).min(1).optional(),
  assetCategories: z.array(AssetCategoryEnum).optional(),
  isActive: z.boolean().optional(),
  archived: z.boolean().optional(),
});
export type TemplateUpdateInput = z.input<typeof TemplateUpdateInputSchema>;

/** Publishing replaces items/accessories and bumps `templateVersion`. */
export const TemplatePublishInputSchema = z.object({
  items: Items,
  accessories: z.array(AccessoryDefSchema).optional(),
  confirmInUse: z.boolean().default(false),
});
export type TemplatePublishInput = z.input<typeof TemplatePublishInputSchema>;
