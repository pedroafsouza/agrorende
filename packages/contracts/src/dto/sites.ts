import { z } from "zod";
import { SiteTypeEnum } from "../enums";
import { OptionalDateTimeSchema, OptionalNumberSchema, OptionalStringSchema, OptionalUuidSchema, SyncDTOSchema } from "./shared";

export const SiteDTOSchema = SyncDTOSchema.extend({
  name: z.string(),
  type: SiteTypeEnum,
  customerId: OptionalUuidSchema,
  address: OptionalStringSchema,
  city: OptionalStringSchema,
  state: OptionalStringSchema,
  lat: OptionalNumberSchema,
  lng: OptionalNumberSchema,
  radiusM: z.number(),
  notes: OptionalStringSchema,
  isActive: z.boolean(),
  archivedAt: OptionalDateTimeSchema,
});
export type SiteDTO = z.infer<typeof SiteDTOSchema>;
