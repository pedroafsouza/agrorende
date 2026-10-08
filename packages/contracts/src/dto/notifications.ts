import { z } from "zod";
import { EntityTypeEnum, NotificationTypeEnum } from "../enums.js";
import { OptionalDateTimeSchema, OptionalUuidSchema, SyncDTOSchema, UuidSchema } from "./shared.js";

export const NotificationDTOSchema = SyncDTOSchema.extend({
  userId: UuidSchema,
  type: NotificationTypeEnum,
  title: z.string(),
  body: z.string(),
  entityType: EntityTypeEnum.nullish(),
  entityId: OptionalUuidSchema,
  readAt: OptionalDateTimeSchema,
  pushedAt: OptionalDateTimeSchema,
});
export type NotificationDTO = z.infer<typeof NotificationDTOSchema>;
