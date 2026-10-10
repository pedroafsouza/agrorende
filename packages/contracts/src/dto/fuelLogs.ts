import { z } from "zod";
import { OptionalIntegerCentsSchema, OptionalNumberSchema, OptionalStringSchema, OptionalUuidSchema, SyncDTOSchema, UuidSchema } from "./shared";

export const FuelLogDTOSchema = SyncDTOSchema.extend({
  assetId: UuidSchema,
  liters: z.number(),
  pricePerLiterCents: OptionalIntegerCentsSchema,
  totalCents: OptionalIntegerCentsSchema,
  hourMeter: OptionalNumberSchema,
  odometerKm: OptionalNumberSchema,
  siteId: OptionalUuidSchema,
  plotId: OptionalUuidSchema,
  seasonId: OptionalUuidSchema,
  operatorId: UuidSchema,
  filledAt: z.string().datetime(),
  lat: OptionalNumberSchema,
  lng: OptionalNumberSchema,
  notes: OptionalStringSchema,
});
export type FuelLogDTO = z.infer<typeof FuelLogDTOSchema>;
