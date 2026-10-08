import { z } from "zod";
import { EntityTypeEnum } from "../enums.js";
import { SyncDTOSchema, UuidSchema } from "./shared.js";

export const CommentDTOSchema = SyncDTOSchema.extend({
  entityType: EntityTypeEnum,
  entityId: UuidSchema,
  authorId: UuidSchema,
  body: z.string(),
});
export type CommentDTO = z.infer<typeof CommentDTOSchema>;
