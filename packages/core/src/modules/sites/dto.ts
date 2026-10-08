import { z } from "zod";
import { SiteTypeEnum } from "@agrorende/contracts/enums";

export type { PlotDTO, SiteDTO } from "@agrorende/contracts/dto";
export type { SiteSummary } from "@agrorende/contracts/seams";

const OptionalText = z.string().trim().max(500).nullish();

export const SiteCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: SiteTypeEnum,
  customerId: z.string().uuid().nullish(),
  address: OptionalText,
  city: OptionalText,
  state: z.string().trim().max(40).nullish(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  radiusM: z.number().positive().max(50_000).default(200),
  notes: z.string().trim().max(4000).nullish(),
  isActive: z.boolean().default(true),
});
export type SiteCreateInput = z.input<typeof SiteCreateInputSchema>;

export const SiteUpdateInputSchema = SiteCreateInputSchema.partial().extend({ archived: z.boolean().optional() });
export type SiteUpdateInput = z.input<typeof SiteUpdateInputSchema>;

/** Coordinates are validated by `validatePlotGeometry` so failures map to PLOT_GEOMETRY_INVALID. */
export const PlotInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().max(40).nullish(),
  crop: z.string().trim().max(80).nullish(),
  areaHa: z.number().nullish(),
  boundary: z
    .object({ type: z.literal("Polygon"), coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))) })
    .nullish(),
  centroidLat: z.number().nullish(),
  centroidLng: z.number().nullish(),
});
export type PlotInput = z.input<typeof PlotInputSchema>;

export const PlotUpdateInputSchema = PlotInputSchema.partial().extend({ archived: z.boolean().optional() });
export type PlotUpdateInput = z.input<typeof PlotUpdateInputSchema>;

export const SiteListFilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  type: SiteTypeEnum.optional(),
  customerId: z.string().uuid().optional(),
  includeArchived: z.enum(["true", "false"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().optional(),
});
export type SiteListFilter = z.infer<typeof SiteListFilterSchema>;
