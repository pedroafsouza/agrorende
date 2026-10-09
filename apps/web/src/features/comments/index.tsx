import type { EntityType } from "@agrorende/contracts/enums";
import type { ReactElement } from "react";

export interface CommentThreadProps {
  readonly entityType: Extract<EntityType, "FIELD_REPORT" | "WORK_ORDER" | "RENTAL">;
  readonly entityId: string;
}

/** Mount point for the comment thread (P1 PLT-10). The wave 6 owner fills it in; until then it renders nothing. */
export function CommentThread(_props: CommentThreadProps): ReactElement | null {
  return null;
}
