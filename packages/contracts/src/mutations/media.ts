import { z } from "zod";

import { MediaTagEnum } from "../enums";
import { MediaMetaSchema, UuidSchema } from "../sync";

/** Payload schemas for the `media.*` mutations (ARCHITECTURE section 7.3). */

export const MediaRegisterPayloadSchema = MediaMetaSchema;
export type MediaRegisterPayload = z.infer<typeof MediaRegisterPayloadSchema>;

export const MediaUpdatePayloadSchema = z.object({
  id: UuidSchema,
  tag: MediaTagEnum.optional(),
  caption: z.string().optional(),
});
export type MediaUpdatePayload = z.infer<typeof MediaUpdatePayloadSchema>;

/** Soft delete. Signatures can never be deleted; the server returns MEDIA_LOCKED. */
export const MediaDeletePayloadSchema = z.object({
  id: UuidSchema,
});
export type MediaDeletePayload = z.infer<typeof MediaDeletePayloadSchema>;
