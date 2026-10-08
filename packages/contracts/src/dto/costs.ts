import { z } from "zod";

import { IntegerCentsSchema, IsoDateTimeSchema } from "./shared.js";

/** Cost roll-up wire shapes (ARCHITECTURE §8 Costs; change request T09-001). */

export const CostGroupByEnum = z.enum(["asset", "site", "plot", "season", "category", "crop"]);
export type CostGroupBy = z.infer<typeof CostGroupByEnum>;

export const CostRollupRowSchema = z.object({
  key: z.string(),
  label: z.string(),
  laborCents: IntegerCentsSchema,
  partsCents: IntegerCentsSchema,
  externalCents: IntegerCentsSchema,
  fuelCents: IntegerCentsSchema,
  rentInCostCents: IntegerCentsSchema,
  totalCostCents: IntegerCentsSchema,
  rentalRevenueCents: IntegerCentsSchema,
});

export const CostRollupFiltersSchema = z.object({
  groupBy: CostGroupByEnum.nullish(),
  from: z.string().nullish(),
  to: z.string().nullish(),
  seasonId: z.string().nullish(),
  assetId: z.string().nullish(),
  siteId: z.string().nullish(),
  locale: z.string().nullish(),
});

export const CostRollupDTOSchema = z.object({
  groupBy: CostGroupByEnum,
  from: IsoDateTimeSchema.nullable(),
  to: IsoDateTimeSchema.nullable(),
  laborVisible: z.boolean(),
  rows: z.array(CostRollupRowSchema),
  totals: CostRollupRowSchema.omit({ key: true, label: true }),
  workOrderCount: z.number().int(),
  rentalCount: z.number().int(),
});
