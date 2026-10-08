import { z } from "zod";
import { EntityTypeEnum } from "../enums.js";
import { JsonSchema, OptionalNumberSchema, OptionalStringSchema, OptionalUuidSchema, SyncDTOSchema, UuidSchema } from "./shared.js";

export const ActivityEventDTOSchema = SyncDTOSchema.extend({
  actorId: OptionalUuidSchema,
  deviceId: OptionalUuidSchema,
  entityType: EntityTypeEnum,
  entityId: UuidSchema,
  action: z.string(),
  fromStatus: OptionalStringSchema,
  toStatus: OptionalStringSchema,
  meta: JsonSchema,
  lat: OptionalNumberSchema,
  lng: OptionalNumberSchema,
  occurredAt: z.string().datetime(),
  receivedAt: z.string().datetime(),
  clockOffsetMs: z.number().int().nullish(),
  mutationId: OptionalUuidSchema,
});
export type ActivityEventDTO = z.infer<typeof ActivityEventDTOSchema>;
