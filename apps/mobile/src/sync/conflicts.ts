import { isAppErrorCode, type AppErrorCode } from "@agrorende/contracts/errors";

import type { SqlDb } from "../db/sql";
import type { OutboxRow } from "./outbox";

export interface ConflictRecord {
  readonly id: string;
  readonly mutationId: string;
  readonly name: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly code: AppErrorCode;
  readonly payload: unknown;
  readonly createdAt: string;
  readonly acknowledgedAt: string | null;
  readonly message: string | undefined;
}

/**
 * Records a rejection so Sync Center can explain it in plain language (OFF-06).
 * The catalog `errors.<CODE>` title/body is the user message; the server text is kept for support.
 */
export async function recordConflict(
  tx: SqlDb,
  input: { readonly id: string; readonly row: OutboxRow; readonly code: string; readonly message?: string; readonly details?: unknown; readonly now: string },
): Promise<void> {
  const code = isAppErrorCode(input.code) ? input.code : "INTERNAL";
  await tx.run(
    "INSERT OR REPLACE INTO conflicts (id, mutationId, name, entityType, entityId, code, payload, createdAt, acknowledgedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)",
    [input.id, input.row.id, input.row.name, input.row.entityType, input.row.entityId, code, JSON.stringify({ payload: input.row.payload, message: input.message, details: input.details, serverCode: input.code }), input.now],
  );
}

export async function listConflicts(db: SqlDb, includeAcknowledged = false): Promise<ConflictRecord[]> {
  const rows = await db.all<Omit<ConflictRecord, "payload" | "message" | "code"> & { payload: string; code: string }>(
    `SELECT * FROM conflicts ${includeAcknowledged ? "" : "WHERE acknowledgedAt IS NULL"} ORDER BY createdAt DESC`,
  );
  return rows.map((row) => {
    const stored = JSON.parse(row.payload) as { payload?: unknown; message?: string };
    return { ...row, code: isAppErrorCode(row.code) ? row.code : "INTERNAL", payload: stored.payload, message: stored.message };
  });
}

export async function acknowledgeConflict(db: SqlDb, id: string, now: string): Promise<void> {
  await db.run("UPDATE conflicts SET acknowledgedAt = ? WHERE id = ?", [now, id]);
}
