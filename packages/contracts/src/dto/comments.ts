import { z } from "zod";
import { EntityTypeEnum } from "../enums";
import { SyncDTOSchema, UuidSchema } from "./shared";

export const CommentDTOSchema = SyncDTOSchema.extend({
  entityType: EntityTypeEnum,
  entityId: UuidSchema,
  authorId: UuidSchema,
  body: z.string(),
});
export type CommentDTO = z.infer<typeof CommentDTOSchema>;
