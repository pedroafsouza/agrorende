import type { MutationName } from "@agrorende/contracts/sync";

import type { SqlDb } from "../db/sql";
import type { OutboxStatus } from "../db/schema";
import { getSyncRuntime } from "./runtime";

export type EnqueueInput = {
  readonly id: string;
  readonly name: MutationName;
  readonly entityType: string;
  readonly entityId: string;
  readonly payload: unknown;
  readonly lat?: number;
  readonly lng?: number;
  readonly occurredAt?: string;
};

export interface OutboxRow {
  readonly seq: number;
  readonly id: string;
  readonly name: MutationName;
  readonly entityType: string;
  readonly entityId: string;
  readonly payload: unknown;
  readonly occurredAt: string;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly status: OutboxStatus;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly nextAttemptAt: string | null;
  readonly inFlightAt: string | null;
  readonly pushAttemptId: string | null;
  readonly createdAt: string;
}

type RawOutboxRow = Omit<OutboxRow, "payload"> & { readonly payload: string };

function decode(row: RawOutboxRow): OutboxRow {
  return { ...row, payload: JSON.parse(row.payload) as unknown };
}

function runtimeNowIso(): string {
  return new Date(getSyncRuntime().clock.now()).toISOString();
}

/** Appends one command to the outbox. Call it inside the mutator's transaction. */
export async function enqueue(input: EnqueueInput, db: SqlDb = getSyncRuntime().db, nowIso: string = runtimeNowIso()): Promise<OutboxRow> {
  const occurredAt = input.occurredAt ?? nowIso;
  await db.run(
    "INSERT INTO outbox (id, name, entityType, entityId, payload, occurredAt, lat, lng, status, attempts, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, ?)",
    [input.id, input.name, input.entityType, input.entityId, JSON.stringify(input.payload), occurredAt, input.lat ?? null, input.lng ?? null, nowIso],
  );
  const row = await getOutboxRow(db, input.id);
  if (row === undefined) throw new Error("outbox insert failed");
  return row;
}

export async function getOutboxRow(db: SqlDb, id: string): Promise<OutboxRow | undefined> {
  const row = await db.get<RawOutboxRow & Record<string, unknown>>("SELECT * FROM outbox WHERE id = ?", [id]);
  return row === undefined ? undefined : decode(row);
}

/** IN_FLIGHT rows go back to PENDING at app start and after any network failure (§7.3). */
export async function resetInFlightOutbox(db: SqlDb = getSyncRuntime().db): Promise<number> {
  const result = await db.run("UPDATE outbox SET status = 'PENDING', inFlightAt = NULL, pushAttemptId = NULL WHERE status = 'IN_FLIGHT'");
  return result.changes;
}

/** Next push batch: PENDING rows in client order, stopping at the first row still backing off. */
export async function nextPushBatch(db: SqlDb, limit: number, nowIso: string): Promise<OutboxRow[]> {
  const rows = await db.all<RawOutboxRow & Record<string, unknown>>("SELECT * FROM outbox WHERE status = 'PENDING' ORDER BY seq ASC LIMIT ?", [limit]);
  const batch: OutboxRow[] = [];
  for (const row of rows) {
    if (row.nextAttemptAt !== null && row.nextAttemptAt > nowIso) break;
    batch.push(decode(row));
  }
  return batch;
}

export async function listOutbox(db: SqlDb, statuses: readonly OutboxStatus[] = ["PENDING", "IN_FLIGHT", "REJECTED"]): Promise<OutboxRow[]> {
  const rows = await db.all<RawOutboxRow & Record<string, unknown>>(`SELECT * FROM outbox WHERE status IN (${statuses.map(() => "?").join(", ")}) ORDER BY seq ASC`, statuses);
  return rows.map(decode);
}

export async function markInFlight(db: SqlDb, ids: readonly string[], pushAttemptId: string, nowIso: string): Promise<void> {
  if (ids.length === 0) return;
  await db.run(`UPDATE outbox SET status = 'IN_FLIGHT', inFlightAt = ?, pushAttemptId = ?, attempts = attempts + 1 WHERE id IN (${ids.map(() => "?").join(", ")})`, [nowIso, pushAttemptId, ...ids]);
}

export async function deferOutboxRow(db: SqlDb, id: string, nextAttemptAt: string, lastError: string): Promise<void> {
  await db.run("UPDATE outbox SET status = 'PENDING', inFlightAt = NULL, pushAttemptId = NULL, nextAttemptAt = ?, lastError = ? WHERE id = ?", [nextAttemptAt, lastError, id]);
}

export async function hasActiveCommands(db: SqlDb, entityType: string, entityId: string, excludeId?: string): Promise<boolean> {
  const row = await db.get(
    "SELECT 1 AS found FROM outbox WHERE entityType = ? AND entityId = ? AND status IN ('PENDING', 'IN_FLIGHT') AND id <> ? LIMIT 1",
    [entityType, entityId, excludeId ?? ""],
  );
  return row !== undefined;
}

/** Entity keys (`TYPE:id`) that still have PENDING or IN_FLIGHT commands; pull never overwrites them. */
export async function activeEntityKeys(db: SqlDb): Promise<Set<string>> {
  const rows = await db.all<{ entityType: string; entityId: string }>("SELECT DISTINCT entityType, entityId FROM outbox WHERE status IN ('PENDING', 'IN_FLIGHT')");
  return new Set(rows.map((row) => `${row.entityType}:${row.entityId}`));
}

export interface OutboxCounts {
  readonly pending: number;
  readonly rejected: number;
  readonly oldestPendingAt: string | undefined;
}

export async function outboxCounts(db: SqlDb): Promise<OutboxCounts> {
  const row = await db.get<{ pending: number | null; rejected: number | null; oldest: string | null }>(
    "SELECT SUM(CASE WHEN status <> 'REJECTED' THEN 1 ELSE 0 END) AS pending, SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected, MIN(CASE WHEN status <> 'REJECTED' THEN occurredAt END) AS oldest FROM outbox",
  );
  return { pending: Number(row?.pending ?? 0), rejected: Number(row?.rejected ?? 0), oldestPendingAt: row?.oldest ?? undefined };
}

/** Removes a REJECTED command after the user acknowledged its conflict ("Discard"). */
export async function discardRejected(db: SqlDb, id: string): Promise<void> {
  await db.run("DELETE FROM outbox WHERE id = ? AND status = 'REJECTED'", [id]);
}
