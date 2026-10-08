import type { SqlDb } from "../db/sql";
import type { SyncRuntime } from "./runtime";

export const DIAGNOSTICS_MAX_ROWS = 500;
export const DIAGNOSTICS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const DIAGNOSTICS_MAX_BYTES = 256 * 1024;
const PII_KEYS = /^(email|phone|name|fullName|password|token|accessToken|refreshToken|authorization|address|cpf|cnpj|taxId|signerName|lat|lng)$/i;

/** Removes personally identifying fields before anything is stored or uploaded (R13). */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth]";
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1));
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = PII_KEYS.test(key) ? "[redacted]" : redact(item, depth + 1);
    }
    return out;
  }
  if (typeof value === "string") return value.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]").slice(0, 2000);
  return value;
}

export interface DiagnosticPayload {
  readonly kind: string;
  readonly code?: string;
  readonly [key: string]: unknown;
}

/** Adds one redacted diagnostic and enforces the 500 rows / 7 days cap. */
export async function enqueueDiagnostic(db: SqlDb, input: { readonly id: string; readonly payload: DiagnosticPayload; readonly nowMs: number }): Promise<void> {
  let json = JSON.stringify(redact(input.payload));
  if (json.length > DIAGNOSTICS_MAX_BYTES) json = JSON.stringify({ kind: input.payload.kind, code: input.payload.code, truncated: true });
  await db.transaction(async (tx) => {
    await tx.run("INSERT INTO diagnostics_queue (id, createdAt, payload, attempts) VALUES (?, ?, ?, 0)", [input.id, new Date(input.nowMs).toISOString(), json]);
    await pruneDiagnostics(tx, input.nowMs);
  });
}

export async function pruneDiagnostics(db: SqlDb, nowMs: number): Promise<void> {
  await db.run("DELETE FROM diagnostics_queue WHERE createdAt < ?", [new Date(nowMs - DIAGNOSTICS_MAX_AGE_MS).toISOString()]);
  await db.run(`DELETE FROM diagnostics_queue WHERE id NOT IN (SELECT id FROM diagnostics_queue ORDER BY createdAt DESC LIMIT ${DIAGNOSTICS_MAX_ROWS})`);
}

export async function countDiagnostics(db: SqlDb): Promise<number> {
  const row = await db.get<{ total: number }>("SELECT COUNT(*) AS total FROM diagnostics_queue");
  return Number(row?.total ?? 0);
}

/** Uploads queued diagnostics after a successful push; rows are deleted only on 2xx. */
export async function uploadDiagnostics(runtime: SyncRuntime, batchSize = 20): Promise<{ readonly sent: number; readonly failed: boolean }> {
  const rows = await runtime.db.all<{ id: string; createdAt: string; payload: string }>("SELECT id, createdAt, payload FROM diagnostics_queue ORDER BY createdAt ASC LIMIT ?", [batchSize]);
  if (rows.length === 0) return { sent: 0, failed: false };
  try {
    await runtime.api.postDiagnostics({ deviceId: runtime.deviceId, items: rows.map((row) => ({ id: row.id, createdAt: row.createdAt, payload: JSON.parse(row.payload) as unknown })) });
  } catch (_error) {
    await runtime.db.run(`UPDATE diagnostics_queue SET attempts = attempts + 1 WHERE id IN (${rows.map(() => "?").join(", ")})`, rows.map((row) => row.id));
    return { sent: 0, failed: true };
  }
  await runtime.db.run(`DELETE FROM diagnostics_queue WHERE id IN (${rows.map(() => "?").join(", ")})`, rows.map((row) => row.id));
  return { sent: rows.length, failed: false };
}
