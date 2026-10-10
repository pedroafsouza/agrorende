import { z } from "zod";
import { AssetCategoryEnum, MediaVariantStatusEnum } from "./enums";
import { LocalizedTextSchema, type LocalizedText } from "./settings";

const ChecklistOptionSchema: z.ZodType<{ value: string; label: LocalizedText }> = z.object({
  value: z.string(),
  label: LocalizedTextSchema,
});

export const ChecklistItemSchema = z.object({
  key: z.string(),
  section: z.string().optional(),
  label: LocalizedTextSchema,
  type: z.enum(["PASS_FAIL_NA", "NUMBER", "TEXT", "SELECT", "PHOTO"]),
  required: z.boolean(),
  isSafetyCritical: z.boolean().default(false),
  photo: z.enum(["NEVER", "ALWAYS", "ON_FAIL"]).default("NEVER"),
  unit: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  options: z.array(ChecklistOptionSchema).optional(),
});

export const ChecklistResponseSchema = z.object({
  key: z.string(),
  value: z.union([z.enum(["PASS", "FAIL", "NA"]), z.number(), z.string(), z.null()]),
  note: z.string().optional(),
  mediaIds: z.array(z.string().uuid()).default([]),
  answeredAt: z.string().datetime(),
});

export const AccessoryDefSchema = z.object({
  accessoryKey: z.string(),
  label: LocalizedTextSchema,
  defaultQty: z.number().int().default(1),
  replacementCostCents: z.number().int().optional(),
});

export const AccessoryLineSchema = z.object({
  accessoryKey: z.string(),
  expected: z.number().int(),
  present: z.number().int(),
  missingReason: z.string().optional(),
  replacementCostCents: z.number().int().optional(),
});

export const CriticalWindowSchema = z.object({
  name: z.string(),
  startsOn: z.string().date(),
  endsOn: z.string().date(),
  assetCategories: z.array(AssetCategoryEnum),
});

export const MediaParentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("FIELD_REPORT"), id: z.string().uuid() }),
  z.object({ type: z.literal("WORK_ORDER"), id: z.string().uuid() }),
  z.object({ type: z.literal("INSPECTION"), id: z.string().uuid() }),
  z.object({ type: z.literal("ASSET"), id: z.string().uuid() }),
  z.object({ type: z.literal("COMMENT"), id: z.string().uuid() }),
  z.object({ type: z.literal("FUEL_LOG"), id: z.string().uuid() }),
]);

export const MediaVariantSchema = z.object({
  status: MediaVariantStatusEnum.default("PENDING"),
  key: z.string().optional(),
  sizeBytes: z.number().int().optional(),
  uploadedAt: z.string().datetime().optional(),
});

export const MediaVariantsSchema = z.object({
  thumb: MediaVariantSchema.optional(),
  poster: MediaVariantSchema.optional(),
  original: MediaVariantSchema,
});

export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;
export type ChecklistResponse = z.infer<typeof ChecklistResponseSchema>;
export type AccessoryDef = z.infer<typeof AccessoryDefSchema>;
export type AccessoryLine = z.infer<typeof AccessoryLineSchema>;
export type CriticalWindow = z.infer<typeof CriticalWindowSchema>;
export type MediaParent = z.infer<typeof MediaParentSchema>;
export type MediaVariant = z.infer<typeof MediaVariantSchema>;
export type MediaVariants = z.infer<typeof MediaVariantsSchema>;
export type ChecklistValue = ChecklistResponse["value"];

const UuidSchema = z.string().uuid();

export function validateChecklistResponse(item: ChecklistItem, value: ChecklistValue): boolean {
  if (value === null) return false;

  switch (item.type) {
    case "PASS_FAIL_NA":
      return value === "PASS" || value === "FAIL" || value === "NA";
    case "NUMBER":
      if (typeof value !== "number" || !Number.isFinite(value)) return false;
      if (item.min !== undefined && value < item.min) return false;
      if (item.max !== undefined && value > item.max) return false;
      return true;
    case "SELECT":
      return typeof value === "string" && (item.options ?? []).some((option) => option.value === value);
    case "TEXT":
      return typeof value === "string" && value.trim().length > 0;
    case "PHOTO":
      return typeof value === "string" && UuidSchema.safeParse(value).success;
  }
}

function hasValidMedia(response: ChecklistResponse | undefined, validMediaIds: ReadonlySet<string>): boolean {
  return response?.mediaIds.some((mediaId) => validMediaIds.has(mediaId)) ?? false;
}

export function isChecklistComplete(
  snapshot: readonly ChecklistItem[],
  responses: readonly ChecklistResponse[],
  validMediaIds: ReadonlySet<string> | readonly string[],
): boolean {
  const validMediaSet = validMediaIds instanceof Set ? validMediaIds : new Set(validMediaIds);
  const responseByKey = new Map(responses.map((response) => [response.key, response]));

  for (const item of snapshot) {
    const response = responseByKey.get(item.key);
    if (item.required && (response === undefined || !validateChecklistResponse(item, response.value))) {
      return false;
    }

    const failed = response?.value === "FAIL";
    const requiresPhoto = item.photo === "ALWAYS" || (item.photo === "ON_FAIL" && failed);
    if (requiresPhoto && !hasValidMedia(response, validMediaSet)) {
      return false;
    }
  }

  return true;
}
