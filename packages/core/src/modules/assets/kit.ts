import { randomBytes } from "node:crypto";

import { getDb, scoped, type ScopedDb, type SyncTx as DbSyncTx } from "@agrorende/db";
import type { EntityType } from "@agrorende/contracts/enums";
import type { z } from "zod";
import { AppError } from "@agrorende/contracts/errors";

import { recordActivity } from "../../activity/index";
import type { Ctx } from "../../context";
import { reject } from "../../errors";
import type { SyncTx } from "../../sync/types";

/**
 * Shared helpers for the master-data modules owned by T04 (assets, sites, seasons,
 * customers, checklists). Seams receive `Tx = unknown` from the contracts package; at
 * runtime it is always the `SyncTx` produced by `withSyncTx` in `@agrorende/db`.
 */
export function dbTx(tx: unknown): DbSyncTx {
  if (typeof tx !== "object" || tx === null || !("db" in tx) || !("syncVersion" in tx)) {
    return reject("INTERNAL", { reason: "tx.invalid" });
  }
  return tx as DbSyncTx;
}

export async function readDb(ctx: Pick<Ctx, "orgId">): Promise<ScopedDb> {
  return scoped({ orgId: ctx.orgId }, await getDb());
}

export function newId(now: number = Date.now()): string {
  const bytes = randomBytes(16);
  const ms = BigInt(now);
  for (let index = 0; index < 6; index += 1) {
    bytes[index] = Number((ms >> BigInt(8 * (5 - index))) & 0xffn);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function convert(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(convert);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, convert(child)]));
  }
  return value;
}

/** Maps a stored document to its wire DTO: `_id` → `id`, dates → ISO, syncVersion → string. */
export function toDto<T>(doc: { readonly _id: string; readonly syncVersion: number } & Record<string, unknown>): T {
  const { _id, syncVersion, ...rest } = doc;
  return { id: _id, syncVersion: String(syncVersion), ...(convert(rest) as Record<string, unknown>) } as T;
}

/** Optimistic concurrency for PATCH: `If-Match` carries the syncVersion the client saw. */
export function assertVersion(current: { readonly syncVersion: number }, expected: string | null | undefined): void {
  if (expected === undefined || expected === null || expected.length === 0) {
    return;
  }
  const normalized = expected.replace(/^W\//u, "").replace(/"/gu, "");
  if (normalized !== String(current.syncVersion)) {
    reject("CONFLICT", { currentVersion: String(current.syncVersion) });
  }
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export function parseCursor(cursor: string | null | undefined): number {
  if (cursor === null || cursor === undefined || cursor.length === 0) {
    return 0;
  }
  const value = Number.parseInt(cursor, 10);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function pageOf<T>(rows: readonly T[], offset: number, limit: number): Page<T> {
  const hasMore = rows.length > limit;
  return { items: hasMore ? rows.slice(0, limit) : rows, nextCursor: hasMore ? String(offset + limit) : null };
}

export function clampLimit(limit: number | null | undefined): number {
  if (limit === null || limit === undefined || !Number.isFinite(limit)) {
    return 50;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), 200);
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export interface ActivityRow {
  readonly entityType: EntityType;
  readonly entityId: string;
  readonly action: string;
  readonly actorId?: string | null;
  readonly fromStatus?: string | null;
  readonly toStatus?: string | null;
  readonly meta?: Record<string, unknown>;
  readonly occurredAt?: Date;
}

/** Writes an ActivityEvent row through the shared `recordActivity` helper (PLT-13). */
export async function writeActivity(tx: DbSyncTx, row: ActivityRow): Promise<void> {
  await recordActivity(tx as unknown as SyncTx, {
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    actorId: row.actorId ?? null,
    fromStatus: row.fromStatus ?? null,
    toStatus: row.toStatus ?? null,
    meta: row.meta ?? {},
    ...(row.occurredAt === undefined ? {} : { occurredAt: row.occurredAt }),
  });
}

export function stampCreate(tx: DbSyncTx, now: Date = new Date()): { syncVersion: number; createdAt: Date; updatedAt: Date } {
  return { syncVersion: tx.syncVersion, createdAt: now, updatedAt: now };
}

export function stampUpdate(tx: DbSyncTx, now: Date = new Date()): { syncVersion: number; updatedAt: Date } {
  return { syncVersion: tx.syncVersion, updatedAt: now };
}

/** Parses service input; zod issues become VALIDATION_FAILED field errors (the issue message is the i18n code). */
export function parseInput<S extends z.ZodTypeAny>(schema: S, raw: unknown): z.output<S> {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data as z.output<S>;
  throw new AppError("VALIDATION_FAILED", {
    fieldErrors: parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      code: issue.code === "custom" ? issue.message : issue.code,
    })),
  });
}
