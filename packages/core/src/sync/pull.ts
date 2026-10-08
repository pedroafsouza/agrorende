import { getClient } from "@agrorende/db";
import {
  PULL_PAGE_LIMIT,
  PullCursorSchema,
  PullRequestSchema,
  TABLE_ORDER,
  type PullCursor,
  type PullResponse,
  type TableName,
} from "@agrorende/contracts/sync";

import type { Ctx } from "../context.js";
import { notImplemented } from "../errors.js";
import { buildScopeFilter, type ScopeFilter } from "./scopes.js";

interface SnapshotSession {
  endSession(): Promise<void>;
}

interface PageResult {
  readonly rows: readonly Record<string, unknown>[];
  readonly deletedIds: readonly string[];
  readonly full: boolean;
  readonly lastVersion: number;
}

function encodeCursor(cursor: PullCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function safeNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function decodeCursor(token: string | undefined): PullCursor | null {
  if (token === undefined) {
    return { v: 1, phase: 1, snap: 0, after: 0 };
  }
  try {
    const raw = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as Record<string, unknown>;
    const snap = safeNumber(raw.snap);
    const after = safeNumber(raw.after);
    const candidate = { ...raw, snap, after };
    return PullCursorSchema.parse(candidate);
  } catch {
    return null;
  }
}

async function readUserScopeEpoch(_ctx: Ctx, _session: SnapshotSession): Promise<number> {
  return notImplemented("sync.pull.readUserScopeEpoch");
}

async function readHorizonVersion(_ctx: Ctx, _session: SnapshotSession): Promise<number> {
  return notImplemented("sync.pull.readHorizonVersion");
}

async function readSnapshotVersion(_ctx: Ctx, _session: SnapshotSession): Promise<number> {
  return notImplemented("sync.pull.readSnapshotVersion");
}

async function readTablePage(
  _ctx: Ctx,
  _session: SnapshotSession,
  _table: TableName,
  _filter: ScopeFilter,
  _after: number,
  _snapshot: number,
): Promise<PageResult> {
  return notImplemented("sync.pull.readTablePage");
}

async function readResolvedMutations(_ctx: Ctx, _session: SnapshotSession, _after: number): Promise<PullResponse["resolvedMutations"]> {
  return notImplemented("sync.pull.readResolvedMutations");
}

async function updateDevicePullState(_ctx: Ctx, _session: SnapshotSession, _deviceId: string, _version: number): Promise<void> {
  return notImplemented("sync.pull.updateDevicePullState");
}

function resetResponse(scopeEpoch: number): PullResponse {
  return {
    cursor: encodeCursor({ v: 1, phase: 1, snap: 0, after: 0 }),
    hasMore: false,
    resetRequired: true,
    scopeEpoch,
    changes: {},
    deleted: {},
    resolvedMutations: [],
    serverTime: new Date().toISOString(),
  };
}

function nextPhase(cursor: PullCursor): PullCursor {
  if (cursor.phase < 3) {
    return { v: 1, phase: (cursor.phase + 1) as PullCursor["phase"], snap: cursor.snap, after: 0 };
  }
  return { v: 1, phase: 3, snap: cursor.snap, after: cursor.snap };
}

export async function pull(ctx: Ctx, input: unknown): Promise<PullResponse> {
  const request = PullRequestSchema.parse(input);
  const decoded = decodeCursor(request.cursor);
  if (decoded === null) {
    return resetResponse(request.scopeEpoch);
  }

  const mongoClient = await getClient();
  const session = mongoClient.startSession({ snapshot: true });
  try {
    const scopeEpoch = await readUserScopeEpoch(ctx, session);
    const horizon = await readHorizonVersion(ctx, session);
    if (decoded.after < horizon || request.scopeEpoch !== scopeEpoch) {
      return resetResponse(scopeEpoch);
    }

    const snapshot = decoded.snap === 0 ? await readSnapshotVersion(ctx, session) : decoded.snap;
    const changes: Partial<Record<TableName, Record<string, unknown>[]>> = {};
    const deleted: Partial<Record<TableName, string[]>> = {};
    let hasMore = false;
    let after = decoded.after;

    for (const table of TABLE_ORDER) {
      const filter = {
        organizationId: ctx.organizationId,
        syncVersion: { $gt: after, $lte: snapshot },
        ...buildScopeFilter(table, { organizationId: ctx.organizationId, userId: ctx.userId, role: ctx.role, now: new Date() }),
      };
      const page = await readTablePage(ctx, session, table, filter, after, snapshot);
      if (page.rows.length > 0) {
        changes[table] = [...page.rows];
      }
      if (page.deletedIds.length > 0) {
        deleted[table] = [...page.deletedIds];
      }
      if (page.full || page.rows.length >= PULL_PAGE_LIMIT) {
        hasMore = true;
        after = Math.max(0, page.lastVersion - 1);
        break;
      }
    }

    const cursor = hasMore ? { v: 1 as const, phase: decoded.phase, snap: snapshot, after } : nextPhase({ ...decoded, snap: snapshot });
    const resolvedMutations = await readResolvedMutations(ctx, session, decoded.after);
    await updateDevicePullState(ctx, session, request.deviceId, cursor.after);

    return {
      cursor: encodeCursor(cursor),
      hasMore,
      resetRequired: false,
      scopeEpoch,
      changes,
      deleted,
      resolvedMutations,
      serverTime: new Date().toISOString(),
    };
  } finally {
    await session.endSession();
  }
}
