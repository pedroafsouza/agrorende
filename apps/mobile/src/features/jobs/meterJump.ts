import type { SqlDb } from "../../db/sql";
import { bumpLocalData } from "../../lib/useLocalQuery";
import { acknowledgeConflict } from "../../sync/conflicts";
import { discardRejected } from "../../sync/outbox";

/**
 * A completion or hand-over the server rejected with `METER_READING_JUMP` after sync
 * (EC-WO-14, EC-RN-09, EC-RN-26). The rejected command stays in the outbox until the
 * user confirms the reading or fixes it, so nothing typed in the field is lost.
 */
export interface MeterJumpConflict {
  readonly conflictId: string;
  readonly mutationId: string;
  readonly name: string;
  /** The rejected mutation payload, exactly as it was queued. */
  readonly payload: unknown;
  /** Last accepted reading, from the server details when present. */
  readonly last: number | null;
  /** The reading the user sent. */
  readonly next: number | null;
  /** Largest increase the server accepts without a confirmation, when it said so. */
  readonly maxDelta: number | null;
}

/** Local outcome of checking a corrected reading before it is queued again. */
export type ReadingCheck = "ok" | "lower" | "jump";

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Reading the user sent in a rejected `workOrder.complete`, `rental.checkout` or `rental.checkin`. */
export function readingOf(name: string, payload: unknown): number | null {
  const body = record(payload);
  if (name === "workOrder.complete") return num(body.hourMeterReading);
  return num(record(body.inspection).hourMeter);
}

/** Newest unacknowledged `METER_READING_JUMP` rejection of one entity whose command is still kept. */
export async function findMeterJumpConflict(db: SqlDb, entityType: string, entityId: string, fallbackLast: number | null = null): Promise<MeterJumpConflict | undefined> {
  const row = await db.get<{ id: string; mutationId: string; name: string; stored: string; queued: string }>(
    "SELECT c.id AS id, c.mutationId AS mutationId, c.name AS name, c.payload AS stored, o.payload AS queued FROM conflicts c JOIN outbox o ON o.id = c.mutationId AND o.status = 'REJECTED' WHERE c.entityType = ? AND c.entityId = ? AND c.code = 'METER_READING_JUMP' AND c.acknowledgedAt IS NULL ORDER BY c.createdAt DESC LIMIT 1",
    [entityType, entityId],
  );
  if (row === undefined) return undefined;
  const payload = JSON.parse(row.queued) as unknown;
  const details = record(record(JSON.parse(row.stored) as unknown).details);
  const elapsed = num(details.elapsedHours);
  return {
    conflictId: row.id,
    mutationId: row.mutationId,
    name: row.name,
    payload,
    last: num(details.current) ?? num(details.previous) ?? fallbackLast,
    next: readingOf(row.name, payload) ?? num(details.reading) ?? num(details.value),
    maxDelta: num(details.maxDelta) ?? (elapsed === null ? null : Math.max(1, elapsed) * 24),
  };
}

/** Device-side check of a corrected reading, with the same bounds the server reported. */
export function checkCorrectedReading(conflict: Pick<MeterJumpConflict, "last" | "maxDelta">, reading: number): ReadingCheck {
  if (conflict.last === null) return "ok";
  if (reading < conflict.last) return "lower";
  if (conflict.maxDelta !== null && reading - conflict.last > conflict.maxDelta) return "jump";
  return "ok";
}

/**
 * Queues the corrected command first, then drops the rejected one and closes its conflict,
 * so a failure while queueing never loses the original data.
 */
export async function replaceRejected(db: SqlDb, conflict: Pick<MeterJumpConflict, "conflictId" | "mutationId">, requeue: () => Promise<unknown>, nowIso: string): Promise<void> {
  await requeue();
  await discardRejected(db, conflict.mutationId);
  await acknowledgeConflict(db, conflict.conflictId, nowIso);
  bumpLocalData();
}
