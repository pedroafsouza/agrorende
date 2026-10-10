import { z } from "zod";
import { IsoDateTimeSchema, TableNameSchema, TABLE_ORDER, UuidSchema, type TableName } from "../sync";

export { IsoDateTimeSchema, TableNameSchema, TABLE_ORDER, UuidSchema, type TableName };
export const IsoDateSchema = z.string().date();
export const SyncVersionSchema = z.string().regex(/^\d+$/);
export const IntegerCentsSchema = z.number().int();
export const JsonSchema = z.unknown();

export const SyncDTOSchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  syncVersion: SyncVersionSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  deletedAt: IsoDateTimeSchema.nullish(),
});

export const OptionalUuidSchema = UuidSchema.nullish();
export const OptionalDateTimeSchema = IsoDateTimeSchema.nullish();
export const OptionalStringSchema = z.string().nullish();
export const OptionalNumberSchema = z.number().nullish();
export const OptionalIntegerCentsSchema = IntegerCentsSchema.nullish();

export const GeoJsonPolygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
});

export const LocationPointSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});
export type LocationPoint = z.infer<typeof LocationPointSchema>;
