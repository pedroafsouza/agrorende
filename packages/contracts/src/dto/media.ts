import { z } from "zod";
import { EntityTypeEnum, MediaKindEnum, MediaStatusEnum, MediaTagEnum } from "../enums.js";
import { MediaParentSchema, MediaVariantsSchema } from "../checklist.js";
import { OptionalDateTimeSchema, OptionalNumberSchema, OptionalStringSchema, OptionalUuidSchema, SyncDTOSchema, UuidSchema } from "./shared.js";

export const MediaDTOSchema = SyncDTOSchema.extend({
  kind: MediaKindEnum,
  status: MediaStatusEnum,
  tag: MediaTagEnum,
  mimeType: z.string(),
  sizeBytes: z.number().int().nullish(),
  durationMs: z.number().int().nullish(),
  width: z.number().int().nullish(),
  height: z.number().int().nullish(),
  storageKey: z.string(),
  thumbnailKey: OptionalStringSchema,
  variants: MediaVariantsSchema,
  caption: OptionalStringSchema,
  capturedAt: z.string().datetime(),
  capturedById: UuidSchema,
  lat: OptionalNumberSchema,
  lng: OptionalNumberSchema,
  uploadedAt: OptionalDateTimeSchema,
  parent: MediaParentSchema,
  damageId: OptionalUuidSchema,
  checklistItemKey: OptionalStringSchema,
  isLateEvidence: z.boolean(),
});
export type MediaDTO = z.infer<typeof MediaDTOSchema>;

export const EntityRefSchema = z.object({ entityType: EntityTypeEnum, entityId: UuidSchema });
export type EntityRef = z.infer<typeof EntityRefSchema>;
