import type { SqlDb } from "../../db/sql";
import { listMediaFiles, type MediaFileRow } from "../../media/queue";
import { listConflicts, type ConflictRecord } from "../../sync/conflicts";
import { countDiagnostics } from "../../sync/diagnostics";
import { listOutbox, type OutboxRow } from "../../sync/outbox";

export interface SyncCenterData {
  readonly outbox: readonly OutboxRow[];
  readonly uploads: readonly MediaFileRow[];
  readonly conflicts: readonly ConflictRecord[];
  readonly diagnostics: number;
}

/** Everything Sync Center shows, read from the local database only (OFF-05, OFF-06). */
export async function loadSyncCenter(db: SqlDb): Promise<SyncCenterData> {
  const [outbox, uploads, conflicts, diagnostics] = await Promise.all([
    listOutbox(db),
    listMediaFiles(db, ["QUEUED", "UPLOADING", "UPLOADED", "FAILED"]),
    listConflicts(db),
    countDiagnostics(db),
  ]);
  return { outbox, uploads, conflicts, diagnostics };
}

/** Plain-language label key for a queued command, e.g. `sync.mutation.fieldReport.create`. */
export function mutationLabelKey(name: string): string {
  return `sync.mutation.${name}`;
}
