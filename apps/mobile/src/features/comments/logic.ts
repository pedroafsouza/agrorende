import type { SqlDb } from "../../db/sql";

export const COMMENT_MAX_LENGTH = 4000;

export interface LocalComment {
  readonly id: string;
  readonly authorId: string;
  readonly authorName: string | null;
  readonly body: string;
  readonly createdAt: string;
  /** Written on this phone and not yet accepted by the server. */
  readonly pending: boolean;
}

/** The thread for one record from the local mirror, oldest first, with author names when known. */
export async function listLocalComments(db: SqlDb, entityType: string, entityId: string): Promise<LocalComment[]> {
  const rows = await db.all(
    `SELECT c.id, c.authorId, c.body, c.createdAt, c._dirty AS dirty, u.name AS authorName
       FROM comments c LEFT JOIN users u ON u.id = c.authorId
      WHERE c.entityType = ? AND c.entityId = ? AND c.deletedAt IS NULL
      ORDER BY c.createdAt ASC, c.id ASC`,
    [entityType, entityId],
  );
  return rows.map((row) => ({
    id: String(row.id),
    authorId: String(row.authorId ?? ""),
    authorName: typeof row.authorName === "string" ? row.authorName : null,
    body: String(row.body ?? ""),
    createdAt: String(row.createdAt ?? ""),
    pending: Number(row.dirty ?? 0) === 1,
  }));
}

/** Message key for an invalid draft, or undefined when it can be sent. */
export function commentDraftError(draft: string): "comments.required" | "comments.tooLong" | undefined {
  const trimmed = draft.trim();
  if (trimmed.length === 0) return "comments.required";
  if (trimmed.length > COMMENT_MAX_LENGTH) return "comments.tooLong";
  return undefined;
}
