import type { SqlDb, SqlRow } from "../db/sql";

/**
 * "Save my pending work" (EC-SYN-12, EC-SYN-13, EC-PLT-42): a read-only snapshot of everything
 * that has not reached the server yet, taken from the live database or from the readable
 * pre-migration copy (`<db>.bak`). The share sheet packages this manifest together with the
 * listed local files; nothing here deletes, rewrites or uploads data.
 */
export const PENDING_WORK_HANDOFF_VERSION = 1;

export interface PendingWorkOutboxItem {
  readonly seq: number;
  readonly id: string;
  readonly name: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly status: string;
  readonly occurredAt: string;
  readonly payload: unknown;
}

export type PendingWorkMedia = {
  readonly mediaId: string;
  readonly localUri: string;
  readonly thumbUri: string | null;
  readonly mimeType: string;
  readonly sizeBytes: number | null;
  readonly state: string;
};

export interface PendingWorkHandoff {
  readonly version: typeof PENDING_WORK_HANDOFF_VERSION;
  readonly exportedAt: string;
  readonly userId: string;
  readonly outbox: readonly PendingWorkOutboxItem[];
  readonly conflicts: readonly Record<string, unknown>[];
  readonly drafts: readonly Record<string, unknown>[];
  readonly media: readonly PendingWorkMedia[];
  /** Local files the share sheet must attach next to the manifest (originals and thumbnails). */
  readonly files: readonly string[];
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch (_error) {
    return value;
  }
}

/** Reads every unsent item. Tables a partial migration never created are treated as empty. */
export async function collectPendingWork(db: SqlDb, input: { readonly userId: string; readonly nowIso: string }): Promise<PendingWorkHandoff> {
  const safeAll = async <T extends SqlRow>(sql: string): Promise<T[]> => {
    try {
      return await db.all<T>(sql);
    } catch (_error) {
      return [];
    }
  };
  const outboxRows = await safeAll<Record<string, unknown>>(
    "SELECT seq, id, name, entityType, entityId, status, occurredAt, payload FROM outbox WHERE status IN ('PENDING', 'IN_FLIGHT') ORDER BY seq ASC",
  );
  const conflicts = await safeAll<Record<string, unknown>>("SELECT * FROM conflicts");
  const drafts = await safeAll<Record<string, unknown>>("SELECT * FROM drafts");
  const media = await safeAll<PendingWorkMedia>(
    "SELECT mediaId, localUri, thumbUri, mimeType, sizeBytes, state FROM media_files WHERE state <> 'DONE' ORDER BY rowid ASC",
  );
  return {
    version: PENDING_WORK_HANDOFF_VERSION,
    exportedAt: input.nowIso,
    userId: input.userId,
    outbox: outboxRows.map((row) => ({
      seq: Number(row.seq),
      id: String(row.id),
      name: String(row.name),
      entityType: String(row.entityType),
      entityId: String(row.entityId),
      status: String(row.status),
      occurredAt: String(row.occurredAt),
      payload: parseJson(row.payload),
    })),
    conflicts: conflicts.map((row) => ({ ...row, payload: parseJson(row.payload) })),
    drafts: drafts.map((row) => ({ ...row, payload: parseJson(row.payload) })),
    media,
    files: media.flatMap((row) => (row.thumbUri === null ? [row.localUri] : [row.localUri, row.thumbUri])),
  };
}
