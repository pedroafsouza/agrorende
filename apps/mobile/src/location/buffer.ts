import type { SqlDb } from "../db/sql";
import type { LocationFix, SyncApi } from "../sync/transport";

export const LOCATION_SOCKET_BATCH = 50;
export const LOCATION_REST_BATCH = 500;
export const LOCATION_BUFFER_CAP = 50_000;
export const LOCATION_SENT_KEEP_MS = 24 * 60 * 60 * 1000;
export const LOCATION_RECENT_KEEP_MS = 48 * 60 * 60 * 1000;
export const LOCATION_THIN_BUCKET_MS = 5 * 60 * 1000;

export interface BufferedFix extends LocationFix {
  readonly id: number;
}

/** Every fix goes to `location_buffer` first (§7.8), including those from the background task. */
export async function recordFix(db: SqlDb, fix: LocationFix): Promise<void> {
  await db.run(
    "INSERT INTO location_buffer (recordedAt, lat, lng, accuracyM, speedMps, heading, batteryLevel, workOrderId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [fix.recordedAt, fix.lat, fix.lng, fix.accuracyM ?? null, fix.speedMps ?? null, fix.heading ?? null, fix.batteryLevel ?? null, fix.workOrderId ?? null],
  );
}

export async function unsentFixes(db: SqlDb, limit: number): Promise<BufferedFix[]> {
  const rows = await db.all<Record<string, unknown>>("SELECT * FROM location_buffer WHERE sentAt IS NULL ORDER BY recordedAt ASC LIMIT ?", [limit]);
  return rows.map((row) => {
    const optional = (key: string) => (row[key] === null || row[key] === undefined ? {} : { [key]: row[key] });
    return {
      id: Number(row.id),
      recordedAt: String(row.recordedAt),
      lat: Number(row.lat),
      lng: Number(row.lng),
      ...optional("accuracyM"),
      ...optional("speedMps"),
      ...optional("heading"),
      ...optional("batteryLevel"),
      ...optional("workOrderId"),
    } as BufferedFix;
  });
}

export async function markFixesSent(db: SqlDb, ids: readonly number[], sentAt: string): Promise<void> {
  if (ids.length === 0) return;
  await db.run(`UPDATE location_buffer SET sentAt = ? WHERE id IN (${ids.map(() => "?").join(", ")})`, [sentAt, ...ids]);
}

export async function countUnsentFixes(db: SqlDb): Promise<number> {
  const row = await db.get<{ total: number }>("SELECT COUNT(*) AS total FROM location_buffer WHERE sentAt IS NULL");
  return Number(row?.total ?? 0);
}

function strip(fix: BufferedFix): LocationFix {
  const { id: _id, ...rest } = fix;
  return rest;
}

/** Socket flush: one batch of ≤ 50 fixes, marked sent only when the gateway acks. */
export async function flushViaSocket(db: SqlDb, emit: (fixes: readonly LocationFix[]) => Promise<boolean>, nowIso: string): Promise<number> {
  const fixes = await unsentFixes(db, LOCATION_SOCKET_BATCH);
  if (fixes.length === 0) return 0;
  if (!(await emit(fixes.map(strip)))) return 0;
  await markFixesSent(db, fixes.map((f) => f.id), nowIso);
  return fixes.length;
}

/** REST fallback, run with every sync cycle: `POST /api/v1/locations/batch` with ≤ 500 fixes per call. */
export async function flushViaRest(db: SqlDb, api: Pick<SyncApi, "postLocations">, deviceId: string, nowIso: string, maxBatches = 10): Promise<number> {
  let sent = 0;
  for (let i = 0; i < maxBatches; i += 1) {
    const fixes = await unsentFixes(db, LOCATION_REST_BATCH);
    if (fixes.length === 0) break;
    try {
      await api.postLocations({ deviceId, fixes: fixes.map(strip) });
    } catch (_error) {
      break;
    }
    await markFixesSent(db, fixes.map((f) => f.id), nowIso);
    sent += fixes.length;
    if (fixes.length < LOCATION_REST_BATCH) break;
  }
  return sent;
}

/** Deletes sent rows after 24 h and keeps the buffer under the 50 000-point cap (§7.8). */
export async function maintainLocationBuffer(db: SqlDb, nowMs: number, cap = LOCATION_BUFFER_CAP): Promise<void> {
  await db.run("DELETE FROM location_buffer WHERE sentAt IS NOT NULL AND sentAt < ?", [new Date(nowMs - LOCATION_SENT_KEEP_MS).toISOString()]);
  const total = Number((await db.get<{ total: number }>("SELECT COUNT(*) AS total FROM location_buffer"))?.total ?? 0);
  if (total <= cap) return;
  const cutoff = new Date(nowMs - LOCATION_RECENT_KEEP_MS).toISOString();
  const old = await db.all<{ id: number; recordedAt: string }>("SELECT id, recordedAt FROM location_buffer WHERE recordedAt < ? ORDER BY recordedAt ASC", [cutoff]);
  const keep = new Set<number>();
  let bucket = -1;
  for (const row of old) {
    const b = Math.floor(Date.parse(row.recordedAt) / LOCATION_THIN_BUCKET_MS);
    if (b !== bucket) {
      keep.add(Number(row.id));
      bucket = b;
    }
  }
  const drop = old.filter((row) => !keep.has(Number(row.id))).map((row) => Number(row.id));
  for (let i = 0; i < drop.length; i += 500) {
    const chunk = drop.slice(i, i + 500);
    await db.run(`DELETE FROM location_buffer WHERE id IN (${chunk.map(() => "?").join(", ")})`, chunk);
  }
}
