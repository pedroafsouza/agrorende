import { z } from "zod";
import { GeoJsonPolygonSchema, OptionalDateTimeSchema, OptionalNumberSchema, OptionalStringSchema, SyncDTOSchema, UuidSchema } from "./shared";

export const PlotDTOSchema = SyncDTOSchema.extend({
  siteId: UuidSchema,
  name: z.string(),
  code: OptionalStringSchema,
  areaHa: OptionalNumberSchema,
  crop: OptionalStringSchema,
  boundary: GeoJsonPolygonSchema.nullish(),
  centroidLat: OptionalNumberSchema,
  centroidLng: OptionalNumberSchema,
  archivedAt: OptionalDateTimeSchema,
});
export type PlotDTO = z.infer<typeof PlotDTOSchema>;
