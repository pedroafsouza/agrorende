import type { SqlDb } from "../db/sql";
import type { DraftKind } from "../db/schema";

export interface DraftRecord<P = unknown> {
  readonly id: string;
  readonly kind: DraftKind;
  readonly refId: string | null;
  readonly step: string;
  readonly payload: P;
  readonly updatedAt: string;
}

/** Wizard drafts in the local `drafts` table (§13.3); never synced. */
export async function saveDraft<P>(db: SqlDb, draft: DraftRecord<P>): Promise<void> {
  await db.run("INSERT OR REPLACE INTO drafts (id, kind, refId, step, payload, updatedAt) VALUES (?, ?, ?, ?, ?, ?)", [
    draft.id,
    draft.kind,
    draft.refId,
    draft.step,
    JSON.stringify(draft.payload),
    draft.updatedAt,
  ]);
}

export async function loadDraft<P>(db: SqlDb, id: string): Promise<DraftRecord<P> | undefined> {
  const row = await db.get<{ id: string; kind: DraftKind; refId: string | null; step: string; payload: string; updatedAt: string }>(
    "SELECT id, kind, refId, step, payload, updatedAt FROM drafts WHERE id = ?",
    [id],
  );
  if (row === undefined) return undefined;
  return { ...row, payload: JSON.parse(row.payload) as P };
}

export async function deleteDraft(db: SqlDb, id: string): Promise<void> {
  await db.run("DELETE FROM drafts WHERE id = ?", [id]);
}

export async function listDrafts(db: SqlDb, kind?: DraftKind): Promise<DraftRecord[]> {
  const rows = await db.all<{ id: string; kind: DraftKind; refId: string | null; step: string; payload: string; updatedAt: string }>(
    kind === undefined ? "SELECT * FROM drafts ORDER BY updatedAt DESC" : "SELECT * FROM drafts WHERE kind = ? ORDER BY updatedAt DESC",
    kind === undefined ? [] : [kind],
  );
  return rows.map((row) => ({ ...row, payload: JSON.parse(row.payload) as unknown }));
}
