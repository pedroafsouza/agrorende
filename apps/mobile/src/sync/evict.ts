import type { SqlDb } from "../db/sql";

const DAY_MS = 24 * 60 * 60 * 1000;

/** SQL fragment: no PENDING/IN_FLIGHT command for the row, and no unsent media under it. */
function notBusy(entityType: string, alias: string): string {
  return `NOT EXISTS (SELECT 1 FROM outbox o WHERE o.entityType = '${entityType}' AND o.entityId = ${alias}.id AND o.status IN ('PENDING', 'IN_FLIGHT'))
    AND NOT EXISTS (SELECT 1 FROM media m JOIN media_files f ON f.mediaId = m.id WHERE json_extract(m.parent, '$.id') = ${alias}.id AND f.state <> 'DONE')`;
}

export interface EvictionSummary {
  readonly fieldReports: number;
  readonly rentals: number;
  readonly workOrders: number;
}

/**
 * Local mirror of the time-based pull scope (§7.5 "Leaving scope"). Rows with
 * pending outbox commands or unsent media are never evicted.
 */
export async function evictOutOfScope(db: SqlDb, input: { readonly userId: string; readonly nowMs: number }): Promise<EvictionSummary> {
  const ninetyDays = new Date(input.nowMs - 90 * DAY_MS).toISOString();
  const thirtyDays = new Date(input.nowMs - 30 * DAY_MS).toISOString();
  return db.transaction(async (tx) => {
    const reports = await tx.run(
      `DELETE FROM field_reports AS r WHERE r.createdAt < ? AND r.reporterId <> ? AND r.workOrderId IS NULL AND r.rentalId IS NULL AND ${notBusy("FIELD_REPORT", "r")}`,
      [ninetyDays, input.userId],
    );
    const rentals = await tx.run(
      `DELETE FROM rentals AS r WHERE r.status IN ('CLOSED', 'CANCELLED') AND COALESCE(r.closedAt, r.cancelledAt, r.updatedAt) < ? AND ${notBusy("RENTAL", "r")}`,
      [thirtyDays],
    );
    const workOrders = await tx.run(
      `DELETE FROM work_orders AS w WHERE w.status IN ('VERIFIED', 'CANCELLED') AND COALESCE(w.verifiedAt, w.cancelledAt, w.updatedAt) < ? AND ${notBusy("WORK_ORDER", "w")}`,
      [thirtyDays],
    );
    return { fieldReports: reports.changes, rentals: rentals.changes, workOrders: workOrders.changes };
  });
}
