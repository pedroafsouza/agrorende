import { z } from "zod";
import { AssetCategoryEnum, AssetConditionEnum, AssetOwnerTypeEnum, RateUnitEnum } from "../enums";
import { JsonSchema, OptionalDateTimeSchema, OptionalIntegerCentsSchema, OptionalNumberSchema, OptionalStringSchema, OptionalUuidSchema, SyncDTOSchema } from "./shared";

export const AssetDTOSchema = SyncDTOSchema.extend({
  code: z.string(),
  name: z.string(),
  category: AssetCategoryEnum,
  make: OptionalStringSchema,
  model: OptionalStringSchema,
  year: z.number().int().nullish(),
  serialNumber: OptionalStringSchema,
  plate: OptionalStringSchema,
  ownerType: AssetOwnerTypeEnum,
  ownerCustomerId: OptionalUuidSchema,
  condition: AssetConditionEnum,
  conditionChangedAt: OptionalDateTimeSchema,
  homeSiteId: OptionalUuidSchema,
  currentSiteId: OptionalUuidSchema,
  currentPlotId: OptionalUuidSchema,
  lastLat: OptionalNumberSchema,
  lastLng: OptionalNumberSchema,
  lastLocatedAt: OptionalDateTimeSchema,
  hourMeter: OptionalNumberSchema,
  odometerKm: OptionalNumberSchema,
  tankCapacityL: OptionalNumberSchema,
  isRentable: z.boolean(),
  defaultRateCents: OptionalIntegerCentsSchema,
  defaultRateUnit: RateUnitEnum.nullish(),
  currentRentalId: OptionalUuidSchema,
  coverMediaId: OptionalUuidSchema,
  specs: JsonSchema,
  notes: OptionalStringSchema,
});
export type AssetDTO = z.infer<typeof AssetDTOSchema>;
