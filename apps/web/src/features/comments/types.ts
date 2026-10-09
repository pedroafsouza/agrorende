import type { EntityType } from "@agrorende/contracts/enums";

/** Records that show a comment thread on the admin web app. */
export type CommentParentType = Extract<EntityType, "FIELD_REPORT" | "WORK_ORDER" | "RENTAL" | "ASSET">;

/** `GET /comments` item: the synced comment plus the author's display name. */
export interface CommentItem {
  readonly id: string;
  readonly entityType: CommentParentType;
  readonly entityId: string;
  readonly authorId: string;
  readonly authorName: string | null;
  readonly body: string;
  readonly createdAt: string;
}

export const COMMENT_MAX_LENGTH = 4000;
