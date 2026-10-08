import { z } from "zod";
import { AssetCategoryEnum, AssetConditionEnum, AssetOwnerTypeEnum, RateUnitEnum } from "@agrorende/contracts/enums";

export type { AssetDTO } from "@agrorende/contracts/dto";
export type { AssetSummary } from "@agrorende/contracts/seams";

const OptionalText = z.string().trim().max(500).nullish();
const OptionalUuid = z.string().uuid().nullish();
const OptionalNumber = z.number().nonnegative().nullish();

export const AssetCreateInputSchema = z.object({
  code: z.string().trim().min(1).max(40).nullish(),
  name: z.string().trim().min(1).max(120),
  category: AssetCategoryEnum,
  make: OptionalText,
  model: OptionalText,
  year: z.number().int().min(1900).max(2100).nullish(),
  serialNumber: OptionalText,
  plate: OptionalText,
  ownerType: AssetOwnerTypeEnum.default("ORGANIZATION"),
  ownerCustomerId: OptionalUuid,
  homeSiteId: OptionalUuid,
  hourMeter: OptionalNumber,
  odometerKm: OptionalNumber,
  tankCapacityL: OptionalNumber,
  isRentable: z.boolean().default(false),
  defaultRateCents: z.number().int().nonnegative().nullish(),
  defaultRateUnit: RateUnitEnum.nullish(),
  coverMediaId: OptionalUuid,
  specs: z.record(z.string(), z.unknown()).default({}),
  notes: z.string().trim().max(4000).nullish(),
});
export type AssetCreateInput = z.input<typeof AssetCreateInputSchema>;

/** Manual conditions an office user may set; derived conditions come from `recomputeCondition`. */
export const ManualConditionSchema = z.enum(["OUT_OF_SERVICE", "OPERATIONAL"]);

export const AssetUpdateInputSchema = AssetCreateInputSchema.omit({ hourMeter: true, odometerKm: true })
  .partial()
  .extend({ condition: ManualConditionSchema.optional() });
export type AssetUpdateInput = z.input<typeof AssetUpdateInputSchema>;

export const AssetRetireInputSchema = z.object({ reason: z.string().trim().min(1).max(500) });
export type AssetRetireInput = z.infer<typeof AssetRetireInputSchema>;

export const AssetListFilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  category: AssetCategoryEnum.optional(),
  condition: AssetConditionEnum.optional(),
  siteId: z.string().uuid().optional(),
  rentable: z.enum(["true", "false"]).optional(),
  includeRetired: z.enum(["true", "false"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().optional(),
});
export type AssetListFilter = z.infer<typeof AssetListFilterSchema>;

export interface AssetHistoryEntry {
  readonly id: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly actorId: string | null;
  readonly fromStatus: string | null;
  readonly toStatus: string | null;
  readonly meta: Record<string, unknown>;
  readonly occurredAt: string;
}
