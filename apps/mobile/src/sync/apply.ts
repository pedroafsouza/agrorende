import { TABLE_ORDER, syncBackoffMs, SYNC_BACKOFF_JITTER_RATIO, type MutationResult, type PullResponse } from "@agrorende/contracts/sync";

import { deleteMirrorRow, entityTypeForTable, isTableName, patchMirrorRow, tableForEntityType, upsertMirrorRow, type MirrorRow } from "../db/mirror";
import type { SqlDb } from "../db/sql";
import { recordConflict } from "./conflicts";
import { activeEntityKeys, deferOutboxRow, getOutboxRow, hasActiveCommands, type OutboxRow } from "./outbox";
import type { SyncRuntime } from "./runtime";
import { SYNC_STATE_KEYS, writeSyncState } from "./state";

export type ApplyContext = Pick<SyncRuntime, "clock" | "random" | "newId">;

/** Backoff with ±20 % jitter (contracts `syncBackoffMs`). */
export function jitteredBackoffMs(attempt: number, random: () => number, baseOverrideMs?: number): number {
  const base = baseOverrideMs ?? syncBackoffMs(attempt);
  const jitter = base * SYNC_BACKOFF_JITTER_RATIO * (random() * 2 - 1);
  return Math.max(0, Math.round(base + jitter));
}

/** Media rows that belong to the entity of a command (the media itself, or media whose parent is it). */
const MEDIA_FOR_ENTITY = "SELECT id FROM media WHERE json_extract(parent, '$.id') = ?";

async function releaseMediaFor(tx: SqlDb, row: OutboxRow): Promise<void> {
  await tx.run(
    `UPDATE media_files SET state = 'QUEUED' WHERE state = 'WAITING_PARENT' AND (mediaId = ? OR mediaId IN (${MEDIA_FOR_ENTITY}))`,
    [row.entityId, row.entityId],
  );
}

async function failMediaFor(tx: SqlDb, row: OutboxRow): Promise<void> {
  // Files are kept on disk so the user can copy or retake them (§7.4).
  await tx.run(
    `UPDATE media_files SET state = 'FAILED' WHERE state = 'WAITING_PARENT' AND (mediaId = ? OR mediaId IN (${MEDIA_FOR_ENTITY}))`,
    [row.entityId, row.entityId],
  );
}

async function settleDirtyFlag(tx: SqlDb, row: OutboxRow): Promise<void> {
  const table = tableForEntityType(row.entityType);
  if (table === undefined) return;
  if (!(await hasActiveCommands(tx, row.entityType, row.entityId))) {
    await patchMirrorRow(tx, table, row.entityId, {}, 0);
  }
}

/**
 * Applies one push (or `resolvedMutations`) result to the outbox and local mirror (§7.3–7.4).
 * Server wins: rejected commands restore the server snapshot unless newer local
 * commands for the same entity are still pending, which then rebase on top.
 */
export async function applyMutationResult(tx: SqlDb, result: MutationResult, ctx: ApplyContext): Promise<"applied" | "rejected" | "retry" | "unknown"> {
  const row = await getOutboxRow(tx, result.id);
  if (row === undefined || row.status === "REJECTED") return "unknown";
  const now = new Date(ctx.clock.now()).toISOString();

  if (result.status === "APPLIED") {
    await tx.run("DELETE FROM outbox WHERE id = ?", [row.id]);
    const table = tableForEntityType(row.entityType);
    if (table !== undefined && result.assigned !== undefined) {
      await patchMirrorRow(tx, table, row.entityId, result.assigned, 1);
    }
    await settleDirtyFlag(tx, row);
    await releaseMediaFor(tx, row);
    return "applied";
  }

  if (result.status === "REJECTED") {
    await tx.run("UPDATE outbox SET status = 'REJECTED', inFlightAt = NULL, pushAttemptId = NULL, lastError = ? WHERE id = ?", [result.code, row.id]);
    await recordConflict(tx, { id: ctx.newId(), row, code: result.code, message: result.message, details: result.details, now });
    const othersPending = await hasActiveCommands(tx, row.entityType, row.entityId, row.id);
    if (!othersPending) {
      const snapshot = result.snapshot;
      if (snapshot === null) {
        const table = tableForEntityType(row.entityType);
        if (table !== undefined) await deleteMirrorRow(tx, table, row.entityId);
      } else if (snapshot !== undefined && isTableName(snapshot.table)) {
        await upsertMirrorRow(tx, snapshot.table, snapshot.row, 0);
      }
    }
    await failMediaFor(tx, row);
    return "rejected";
  }

  const delay = jitteredBackoffMs(row.attempts, ctx.random, result.retryAfterMs);
  await deferOutboxRow(tx, row.id, new Date(ctx.clock.now() + delay).toISOString(), "RETRY");
  return "retry";
}

async function hasUnsentMedia(tx: SqlDb, mediaId: string): Promise<boolean> {
  const row = await tx.get("SELECT 1 AS found FROM media_files WHERE mediaId = ? AND state NOT IN ('DONE') LIMIT 1", [mediaId]);
  return row !== undefined;
}

export interface ApplyPullSummary {
  readonly upserted: number;
  readonly deleted: number;
  readonly skipped: number;
  readonly resolved: number;
}

/**
 * Applies one pull page in a single transaction (§7.5). Rows of entities with
 * PENDING or IN_FLIGHT commands are skipped so local intent is never overwritten.
 */
export async function applyPullResponse(tx: SqlDb, page: PullResponse, ctx: ApplyContext): Promise<ApplyPullSummary> {
  let upserted = 0;
  let deleted = 0;
  let skipped = 0;
  let resolved = 0;
  // Resolutions first, so rows of commands that just settled are not skipped below.
  for (const result of page.resolvedMutations) {
    const outcome = await applyMutationResult(tx, result, ctx);
    if (outcome !== "unknown") resolved += 1;
  }
  const active = await activeEntityKeys(tx);

  for (const table of TABLE_ORDER) {
    const rows = page.changes[table];
    if (rows === undefined) continue;
    const entityType = entityTypeForTable(table);
    for (const row of rows) {
      const id = typeof row.id === "string" ? row.id : undefined;
      if (id === undefined) continue;
      if (active.has(`${entityType}:${id}`)) {
        skipped += 1;
        continue;
      }
      const decoded: MirrorRow = { ...row };
      if (decoded.syncVersion !== undefined && decoded.syncVersion !== null) decoded.syncVersion = Number(decoded.syncVersion);
      await upsertMirrorRow(tx, table, decoded, 0);
      upserted += 1;
    }
  }

  for (const table of TABLE_ORDER) {
    const ids = page.deleted[table];
    if (ids === undefined) continue;
    const entityType = entityTypeForTable(table);
    for (const id of ids) {
      if (active.has(`${entityType}:${id}`) || (table === "media" && (await hasUnsentMedia(tx, id)))) {
        skipped += 1;
        continue;
      }
      await deleteMirrorRow(tx, table, id);
      deleted += 1;
    }
  }

  await writeSyncState(tx, SYNC_STATE_KEYS.cursor, page.cursor);
  await writeSyncState(tx, SYNC_STATE_KEYS.scopeEpoch, String(page.scopeEpoch));
  return { upserted, deleted, skipped, resolved };
}
