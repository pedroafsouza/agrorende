import type { PullRequest, PullResponse } from "@agrorende/contracts/sync";

import { MIRROR_TABLE_NAMES, entityTypeForTable, sqlTableName } from "../db/mirror";
import { quoteIdent, type SqlDb } from "../db/sql";
import { applyPullResponse } from "./apply";
import { replayPendingMutations } from "./mutator";
import { recordServerTime } from "./push";
import { nowIso, type SyncRuntime } from "./runtime";
import { deleteSyncState, readSyncState, SYNC_STATE_KEYS, writeSyncState } from "./state";

export type PullTransport = { readonly pull: (request: PullRequest) => Promise<PullResponse> };

export interface PullOutcome {
  readonly pages: number;
  readonly upserted: number;
  readonly deleted: number;
  readonly skipped: number;
  readonly resets: number;
}

/**
 * Scope reset (§7.6): keep dirty rows (pending commands, unsent media), delete clean
 * mirror rows, forget the cursor. Local tables (outbox, media_files, drafts…) are untouched.
 */
export async function resetMirrorForRebase(tx: SqlDb, scopeEpoch: number): Promise<number> {
  let removed = 0;
  for (const table of MIRROR_TABLE_NAMES) {
    const name = quoteIdent(sqlTableName(table));
    const entityType = entityTypeForTable(table);
    const mediaGuard =
      table === "media"
        ? "AND NOT EXISTS (SELECT 1 FROM media_files f WHERE f.mediaId = t.id AND f.state <> 'DONE')"
        : "";
    const result = await tx.run(
      `DELETE FROM ${name} AS t WHERE t._dirty = 0 AND NOT EXISTS (SELECT 1 FROM outbox o WHERE o.entityType = ? AND o.entityId = t.id AND o.status IN ('PENDING', 'IN_FLIGHT')) ${mediaGuard}`,
      [entityType],
    );
    removed += result.changes;
  }
  await deleteSyncState(tx, SYNC_STATE_KEYS.cursor);
  await writeSyncState(tx, SYNC_STATE_KEYS.scopeEpoch, String(scopeEpoch));
  return removed;
}

/**
 * Pull loop (§7.5): pages until `hasMore` is false, one transaction per page.
 * `resetRequired` triggers the rebase above, a full re-pull and a local replay of
 * pending mutators over the fresh base. The outbox is always kept.
 */
export async function pullChanges(runtime: SyncRuntime, maxPages = 200): Promise<PullOutcome> {
  let pages = 0;
  let upserted = 0;
  let deleted = 0;
  let skipped = 0;
  let resets = 0;
  runtime.store.setState({ phase: "pulling" });
  while (pages < maxPages) {
    const cursor = await readSyncState(runtime.db, SYNC_STATE_KEYS.cursor);
    const scopeEpoch = Number((await readSyncState(runtime.db, SYNC_STATE_KEYS.scopeEpoch)) ?? 0);
    const page = await runtime.api.pull({ deviceId: runtime.deviceId, scopeEpoch, ...(cursor === undefined ? {} : { cursor }) });
    pages += 1;
    await recordServerTime(runtime, page.serverTime);
    if (page.resetRequired) {
      if (resets > 0) throw new Error("pull reset loop");
      resets += 1;
      runtime.store.setState({ phase: "resetting" });
      await runtime.db.transaction((tx) => resetMirrorForRebase(tx, page.scopeEpoch));
      continue;
    }
    const summary = await runtime.db.transaction((tx) => applyPullResponse(tx, page, runtime));
    upserted += summary.upserted;
    deleted += summary.deleted;
    skipped += summary.skipped;
    if (!page.hasMore) break;
  }
  if (resets > 0) {
    await runtime.db.transaction((tx) => replayPendingMutations(tx, runtime));
  }
  await writeSyncState(runtime.db, SYNC_STATE_KEYS.lastSyncAt, nowIso(runtime));
  await writeSyncState(runtime.db, SYNC_STATE_KEYS.firstSyncDone, "1");
  runtime.store.setState({ lastSyncAt: nowIso(runtime), firstSyncDone: true, scopeEpoch: Number((await readSyncState(runtime.db, SYNC_STATE_KEYS.scopeEpoch)) ?? 0) });
  return { pages, upserted, deleted, skipped, resets };
}
