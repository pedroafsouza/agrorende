import { randomUUID } from "node:crypto";

import { collections, getDatabaseName, getDb, type CollectionDocumentMap } from "@agrorende/db";
import type { DutyStatus, WorkOrderStatus } from "@agrorende/contracts/enums";
import { RealtimeServerEvents, opsRoom, type LocationFix, type OperatorState } from "@agrorende/contracts/realtime";
import type { LiveFix, LiveOperator, LocationSeams } from "@agrorende/contracts/seams";
import type { Redis } from "ioredis";
import type { Db } from "./types.js";

import type { Ctx } from "../../context.js";
import { reject } from "../../errors.js";
import {
  LiveRecordSchema,
  MAX_ACCURACY_M,
  MAX_FUTURE_SKEW_MS,
  MAX_SPEED_MPS,
  REST_BATCH_MAX,
  RETENTION_DAYS,
  locationBatchSchema,
  type IngestResult,
  type LiveRecord,
} from "./dto.js";
import { liveKey, locationThrottleKey, presenceKey } from "./keys.js";
import { publishRealtime } from "./publish.js";
import { locationsRedis } from "./redis.js";
import { ACTIVE_WORK_ORDER_STATUSES, OFFLINE_AFTER_MS, deriveOperatorState } from "./state.js";

type LocationPingDoc = CollectionDocumentMap["location_pings"];

export const LOCATION_EMIT_THROTTLE_MS = 2_000;
export const PING_FLUSH_MS = 2_000;

/** Atomic "newer only" update of one field of the `live:<orgId>` hash. */
const NEWER_ONLY_HSET = `
local current = redis.call('HGET', KEYS[1], ARGV[1])
if current then
  local ok, decoded = pcall(cjson.decode, current)
  if ok and type(decoded) == 'table' and decoded.recordedAtMs and tonumber(decoded.recordedAtMs) >= tonumber(ARGV[2]) then
    return 0
  end
end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
return 1
`;

export interface LocationDeps {
  readonly db?: Db;
  readonly redis?: Redis;
  readonly dbName?: string;
  readonly now?: Date;
}

export interface IngestOptions extends LocationDeps {
  /** Maximum fixes per call: 50 for the socket, 500 (default) for the REST fallback. */
  readonly maxFixes?: number;
  /** Optional buffered writer (the gateway batches inserts every 2 s). */
  readonly writer?: PingWriter;
}

export type IngestCtx = Pick<Ctx, "orgId" | "userId"> & { readonly deviceId?: string | null };

async function resolveDb(deps: LocationDeps): Promise<Db> {
  return deps.db ?? (await getDb(deps.dbName));
}

function resolveRedis(deps: LocationDeps): Redis {
  return deps.redis ?? locationsRedis();
}

function resolveDbName(deps: LocationDeps): string {
  return deps.dbName ?? deps.db?.databaseName ?? getDatabaseName();
}

function isDuplicateKeyOnly(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const writeErrors = (error as { writeErrors?: unknown }).writeErrors;
  if (Array.isArray(writeErrors) && writeErrors.length > 0) {
    return writeErrors.every((entry: unknown) => typeof entry === "object" && entry !== null && (entry as { code?: unknown }).code === 11000);
  }
  return (error as { code?: unknown }).code === 11000;
}

/** Inserts pings with `ordered: false`, ignoring duplicate `(userId, recordedAt)` rows. */
export async function insertPings(db: Db, docs: readonly LocationPingDoc[]): Promise<void> {
  if (docs.length === 0) {
    return;
  }
  try {
    await collections.locationPings(db).insertMany([...docs], { ordered: false });
  } catch (error: unknown) {
    if (!isDuplicateKeyOnly(error)) {
      throw error;
    }
  }
}

export interface PingWriter {
  enqueue(docs: readonly LocationPingDoc[]): void;
  flush(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Buffers ping rows and inserts them every `flushMs` (ARCHITECTURE §7.8 step 2). The gateway
 * uses one writer per process; the REST fallback writes directly so its 200 means "stored".
 */
export function createPingWriter(
  options: { readonly db?: Db; readonly dbName?: string; readonly flushMs?: number; readonly onError?: (error: unknown) => void } = {},
): PingWriter {
  let buffer: LocationPingDoc[] = [];
  let pending: Promise<void> = Promise.resolve();
  const timer = setInterval(() => {
    void flush();
  }, options.flushMs ?? PING_FLUSH_MS);
  timer.unref();

  async function flush(): Promise<void> {
    const batch = buffer;
    buffer = [];
    if (batch.length === 0) {
      return pending;
    }
    pending = pending
      .then(async () => insertPings(options.db ?? (await getDb(options.dbName)), batch))
      .catch((error: unknown) => {
        options.onError?.(error);
      });
    return pending;
  }

  return {
    enqueue(docs) {
      buffer.push(...docs);
    },
    flush,
    async close() {
      clearInterval(timer);
      await flush();
    },
  };
}

function isSane(fix: LocationFix, now: Date): boolean {
  const recordedAt = Date.parse(fix.recordedAt);
  if (!Number.isFinite(recordedAt)) {
    return false;
  }
  if (recordedAt - now.getTime() > MAX_FUTURE_SKEW_MS) {
    return false;
  }
  if (now.getTime() - recordedAt > RETENTION_DAYS * 24 * 60 * 60 * 1000) {
    return false;
  }
  if (fix.accuracyM !== undefined && fix.accuracyM > MAX_ACCURACY_M) {
    return false;
  }
  if (fix.speedMps !== undefined && (fix.speedMps < 0 || fix.speedMps > MAX_SPEED_MPS)) {
    return false;
  }
  return true;
}

async function activeWorkOrders(db: Db, orgId: string, userIds: readonly string[]): Promise<Map<string, { id: string; status: WorkOrderStatus }>> {
  const result = new Map<string, { id: string; status: WorkOrderStatus }>();
  if (userIds.length === 0) {
    return result;
  }
  const rows = await collections
    .workOrders(db)
    .find(
      { organizationId: orgId, assigneeId: { $in: [...userIds] }, status: { $in: [...ACTIVE_WORK_ORDER_STATUSES] }, deletedAt: null },
      { projection: { _id: 1, assigneeId: 1, status: 1, updatedAt: 1 }, sort: { updatedAt: -1 } },
    )
    .toArray();
  for (const row of rows) {
    if (typeof row.assigneeId === "string" && !result.has(row.assigneeId)) {
      result.set(row.assigneeId, { id: row._id, status: row.status });
    }
  }
  return result;
}

async function presenceScores(redis: Redis, orgId: string, dbName: string): Promise<Map<string, number>> {
  const flat = await redis.zrange(presenceKey(orgId, dbName), "0", "-1", "WITHSCORES");
  const scores = new Map<string, number>();
  for (let index = 0; index + 1 < flat.length; index += 2) {
    const member = flat[index];
    const score = Number(flat[index + 1]);
    if (member !== undefined && Number.isFinite(score)) {
      scores.set(member, score);
    }
  }
  return scores;
}

function parseLiveRecord(raw: string | null | undefined): LiveRecord | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  try {
    const parsed = LiveRecordSchema.safeParse(JSON.parse(raw) as unknown);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function liveFixFromRecord(record: LiveRecord): LiveFix {
  return {
    userId: record.userId,
    lat: record.lat,
    lng: record.lng,
    ...(record.accuracyM === undefined ? {} : { accuracyM: record.accuracyM }),
    ...(record.heading === undefined ? {} : { heading: record.heading }),
    ...(record.speedMps === undefined ? {} : { speedMps: record.speedMps }),
    recordedAt: new Date(record.recordedAtMs),
  };
}

function optionalNumber(value: number | null | undefined): number | undefined {
  return value === null || value === undefined ? undefined : value;
}

/**
 * Ingests a batch of fixes from the socket or the REST fallback (ARCHITECTURE §7.8).
 *
 * Invalid payloads are rejected with `VALIDATION_FAILED`. Fixes from users who are not
 * ON_DUTY (or inactive) are dropped, as are fixes that fail the sanity limits. Accepted
 * fixes are stored in `location_pings`, the newest one updates `live:<orgId>` only if it is
 * newer, and `operator:location` is published to the ops room at most once per user per 2 s.
 */
export async function ingest(ctx: IngestCtx, input: unknown, options: IngestOptions = {}): Promise<IngestResult> {
  const parsed = locationBatchSchema(options.maxFixes ?? REST_BATCH_MAX).safeParse(input);
  if (!parsed.success) {
    reject("VALIDATION_FAILED", { issues: parsed.error.issues.slice(0, 5).map((issue) => ({ path: issue.path.join("."), code: issue.code })) });
  }
  const fixes = parsed.data.fixes;
  if (fixes.length === 0) {
    return { accepted: 0, dropped: 0 };
  }

  const now = options.now ?? new Date();
  const db = await resolveDb(options);
  const dbName = resolveDbName(options);
  const user = await collections
    .users(db)
    .findOne({ _id: ctx.userId, organizationId: ctx.orgId }, { projection: { dutyStatus: 1, isActive: 1, deletedAt: 1 } });
  if (user === null || user.dutyStatus !== "ON_DUTY" || user.isActive === false || (user.deletedAt ?? null) !== null) {
    return { accepted: 0, dropped: fixes.length };
  }

  const seen = new Set<number>();
  const accepted: LocationFix[] = [];
  for (const fix of fixes) {
    const at = Date.parse(fix.recordedAt);
    if (!isSane(fix, now) || seen.has(at)) {
      continue;
    }
    seen.add(at);
    accepted.push(fix);
  }
  if (accepted.length === 0) {
    return { accepted: 0, dropped: fixes.length };
  }

  const docs: LocationPingDoc[] = accepted.map((fix) => ({
    _id: randomUUID(),
    organizationId: ctx.orgId,
    userId: ctx.userId,
    deviceId: ctx.deviceId ?? null,
    recordedAt: new Date(fix.recordedAt),
    receivedAt: now,
    lat: fix.lat,
    lng: fix.lng,
    accuracyM: fix.accuracyM ?? null,
    speedMps: fix.speedMps ?? null,
    heading: fix.heading ?? null,
    batteryLevel: fix.batteryLevel ?? null,
    workOrderId: fix.workOrderId ?? null,
  }));
  if (options.writer === undefined) {
    await insertPings(db, docs);
  } else {
    options.writer.enqueue(docs);
  }

  const latest = accepted.reduce((best, fix) => (Date.parse(fix.recordedAt) > Date.parse(best.recordedAt) ? fix : best));
  const activeWo = (await activeWorkOrders(db, ctx.orgId, [ctx.userId])).get(ctx.userId) ?? null;
  const latestAt = new Date(latest.recordedAt);
  const state = deriveOperatorState(latestAt, true, activeWo?.status ?? null, now);
  const record: LiveRecord = {
    userId: ctx.userId,
    lat: latest.lat,
    lng: latest.lng,
    ...(latest.accuracyM === undefined ? {} : { accuracyM: latest.accuracyM }),
    ...(latest.heading === undefined ? {} : { heading: latest.heading }),
    ...(latest.speedMps === undefined ? {} : { speedMps: latest.speedMps }),
    recordedAt: latestAt.toISOString(),
    recordedAtMs: latestAt.getTime(),
    state,
    ...(activeWo === null ? {} : { workOrderId: activeWo.id }),
  };

  const redis = resolveRedis(options);
  const updated = await redis.eval(NEWER_ONLY_HSET, 1, liveKey(ctx.orgId, dbName), ctx.userId, String(record.recordedAtMs), JSON.stringify(record));
  if (updated === 1) {
    const allowed = await redis.set(locationThrottleKey(ctx.orgId, ctx.userId, dbName), "1", "PX", LOCATION_EMIT_THROTTLE_MS, "NX");
    if (allowed === "OK") {
      await publishRealtime(
        redis,
        {
          orgId: ctx.orgId,
          rooms: [opsRoom(ctx.orgId)],
          event: RealtimeServerEvents.operatorLocation,
          payload: {
            userId: record.userId,
            lat: record.lat,
            lng: record.lng,
            ...(record.accuracyM === undefined ? {} : { accuracyM: record.accuracyM }),
            ...(record.heading === undefined ? {} : { heading: record.heading }),
            ...(record.speedMps === undefined ? {} : { speedMps: record.speedMps }),
            recordedAt: record.recordedAt,
            state,
          },
        },
        dbName,
      );
    }
  }

  return { accepted: accepted.length, dropped: fixes.length - accepted.length };
}

export interface PresenceInput {
  readonly online: boolean;
  /** Publish `operator:presence` (on connect, disconnect and duty change, not on every ping). */
  readonly publish: boolean;
}

/** Records presence in `presence:<orgId>` (ZSET of last seen, score = epoch ms). */
export async function recordPresence(
  ctx: Pick<Ctx, "orgId" | "userId">,
  input: PresenceInput,
  deps: LocationDeps = {},
): Promise<void> {
  const now = deps.now ?? new Date();
  const redis = resolveRedis(deps);
  const dbName = resolveDbName(deps);
  await redis.zadd(presenceKey(ctx.orgId, dbName), now.getTime(), ctx.userId);
  if (!input.publish) {
    return;
  }
  const db = await resolveDb(deps);
  const user = await collections.users(db).findOne({ _id: ctx.userId, organizationId: ctx.orgId }, { projection: { dutyStatus: 1 } });
  const dutyStatus: DutyStatus = user?.dutyStatus ?? "OFF_DUTY";
  await publishRealtime(
    redis,
    {
      orgId: ctx.orgId,
      rooms: [opsRoom(ctx.orgId)],
      event: RealtimeServerEvents.operatorPresence,
      payload: { userId: ctx.userId, online: input.online, dutyStatus, lastSeenAt: now.toISOString() },
    },
    dbName,
  );
}

/**
 * Seam `locations.lastFixes`: latest fix per user from the Redis hash, falling back to the
 * newest `location_pings` row for users missing from the hash.
 */
export async function lastFixes(orgId: string, userIds: string[], deps: LocationDeps = {}): Promise<Map<string, LiveFix>> {
  const result = new Map<string, LiveFix>();
  const unique = [...new Set(userIds)];
  if (unique.length === 0) {
    return result;
  }
  const redis = resolveRedis(deps);
  const dbName = resolveDbName(deps);
  const raw = await redis.hmget(liveKey(orgId, dbName), ...unique);
  const missing: string[] = [];
  unique.forEach((userId, index) => {
    const record = parseLiveRecord(raw[index]);
    if (record === null) {
      missing.push(userId);
    } else {
      result.set(userId, liveFixFromRecord(record));
    }
  });
  if (missing.length === 0) {
    return result;
  }

  const db = await resolveDb(deps);
  const rows = await collections
    .locationPings(db)
    .aggregate<{ _id: string; ping: LocationPingDoc }>([
      { $match: { organizationId: orgId, userId: { $in: missing } } },
      { $sort: { userId: 1, recordedAt: -1 } },
      { $group: { _id: "$userId", ping: { $first: "$$ROOT" } } },
    ])
    .toArray();
  for (const row of rows) {
    const ping = row.ping;
    const accuracyM = optionalNumber(ping.accuracyM);
    const heading = optionalNumber(ping.heading);
    const speedMps = optionalNumber(ping.speedMps);
    result.set(row._id, {
      userId: row._id,
      lat: ping.lat,
      lng: ping.lng,
      ...(accuracyM === undefined ? {} : { accuracyM }),
      ...(heading === undefined ? {} : { heading }),
      ...(speedMps === undefined ? {} : { speedMps }),
      recordedAt: ping.recordedAt,
    });
  }
  return result;
}

/** How far back `hydrateLiveHash` looks for a last fix when the live hash is empty. */
export const LIVE_HYDRATE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Rebuilds an empty `live:<orgId>` hash from the newest `location_pings` row of each user recorded in
 * the last 24 h (after a Redis flush, a restart without persistence, or a fresh seed — ARCHITECTURE
 * §17 expects the seeded fixes on the live map). Uses the same "newer only" write as `ingest`.
 */
async function hydrateLiveHash(db: Db, redis: Redis, orgId: string, dbName: string, now: Date): Promise<LiveRecord[]> {
  const rows = await collections
    .locationPings(db)
    .aggregate<{ _id: string; ping: LocationPingDoc }>([
      { $match: { organizationId: orgId, recordedAt: { $gte: new Date(now.getTime() - LIVE_HYDRATE_WINDOW_MS) } } },
      { $sort: { userId: 1, recordedAt: -1 } },
      { $group: { _id: "$userId", ping: { $first: "$$ROOT" } } },
    ])
    .toArray();
  if (rows.length === 0) {
    return [];
  }
  const active = await activeWorkOrders(
    db,
    orgId,
    rows.map((row) => row._id),
  );
  const records: LiveRecord[] = [];
  for (const row of rows) {
    const ping = row.ping;
    const recordedAt = new Date(ping.recordedAt);
    const activeWo = active.get(row._id) ?? null;
    const accuracyM = optionalNumber(ping.accuracyM);
    const heading = optionalNumber(ping.heading);
    const speedMps = optionalNumber(ping.speedMps);
    const record: LiveRecord = {
      userId: row._id,
      lat: ping.lat,
      lng: ping.lng,
      ...(accuracyM === undefined ? {} : { accuracyM }),
      ...(heading === undefined ? {} : { heading }),
      ...(speedMps === undefined ? {} : { speedMps }),
      recordedAt: recordedAt.toISOString(),
      recordedAtMs: recordedAt.getTime(),
      state: deriveOperatorState(recordedAt, false, activeWo?.status ?? null, now),
      ...(activeWo === null ? {} : { workOrderId: activeWo.id }),
    };
    await redis.eval(NEWER_ONLY_HSET, 1, liveKey(orgId, dbName), record.userId, String(record.recordedAtMs), JSON.stringify(record));
    records.push(record);
  }
  return records;
}

/**
 * Seam `locations.liveSnapshot`: every operator with a live fix, merged with the user row,
 * the presence ZSET and the active work order to derive `state`.
 */
export async function liveSnapshot(orgId: string, deps: LocationDeps = {}): Promise<LiveOperator[]> {
  const now = deps.now ?? new Date();
  const redis = resolveRedis(deps);
  const dbName = resolveDbName(deps);
  const hash = await redis.hgetall(liveKey(orgId, dbName));
  let records = Object.values(hash)
    .map((raw) => parseLiveRecord(raw))
    .filter((record): record is LiveRecord => record !== null);
  const db = await resolveDb(deps);
  if (records.length === 0) {
    records = await hydrateLiveHash(db, redis, orgId, dbName, now);
    if (records.length === 0) {
      return [];
    }
  }
  const userIds = records.map((record) => record.userId);
  const [users, presence, workOrders] = await Promise.all([
    collections
      .users(db)
      .find({ organizationId: orgId, _id: { $in: userIds }, deletedAt: null }, { projection: { name: 1, dutyStatus: 1, isActive: 1 } })
      .toArray(),
    presenceScores(redis, orgId, dbName),
    activeWorkOrders(db, orgId, userIds),
  ]);
  const usersById = new Map(users.map((user) => [user._id, user]));

  const operators: LiveOperator[] = [];
  for (const record of records) {
    const user = usersById.get(record.userId);
    if (user === undefined || user.isActive === false) {
      continue;
    }
    const lastPresenceMs = presence.get(record.userId);
    const socketOnline = lastPresenceMs !== undefined && now.getTime() - lastPresenceMs <= OFFLINE_AFTER_MS;
    const fix = liveFixFromRecord(record);
    const state: OperatorState = deriveOperatorState(fix.recordedAt, socketOnline, workOrders.get(record.userId)?.status ?? null, now);
    const lastSeenMs = Math.max(lastPresenceMs ?? 0, record.recordedAtMs);
    operators.push({
      ...fix,
      name: user.name,
      dutyStatus: user.dutyStatus,
      state,
      lastSeenAt: lastSeenMs > 0 ? new Date(lastSeenMs) : null,
    });
  }
  return operators.sort((left, right) => left.name.localeCompare(right.name));
}

export const PRUNE_CHUNK_SIZE = 1_000;

/**
 * `locations.prune` safety pass: deletes `location_pings` older than the retention window in
 * chunks of `chunkSize` ids so a large backlog never holds one long delete.
 */
export async function pruneLocationPings(
  options: { readonly db?: Db; readonly now?: Date; readonly retentionDays?: number; readonly chunkSize?: number } = {},
): Promise<{ deleted: number; chunks: number }> {
  const db = options.db ?? (await getDb());
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - (options.retentionDays ?? RETENTION_DAYS) * 24 * 60 * 60 * 1000);
  const chunkSize = options.chunkSize ?? PRUNE_CHUNK_SIZE;
  const pings = collections.locationPings(db);
  let deleted = 0;
  let chunks = 0;
  for (;;) {
    const ids = (await pings.find({ recordedAt: { $lt: cutoff } }, { projection: { _id: 1 }, limit: chunkSize }).toArray()).map((row) => row._id);
    if (ids.length === 0) {
      break;
    }
    const result = await pings.deleteMany({ _id: { $in: ids } });
    deleted += result.deletedCount;
    chunks += 1;
    if (ids.length < chunkSize) {
      break;
    }
  }
  return { deleted, chunks };
}

/** Implementation of the `LocationSeams` contract; `core/seams.ts` delegates here (T05-002). */
export const locationSeamsImpl = {
  lastFixes: (orgId: string, userIds: string[]) => lastFixes(orgId, userIds),
  liveSnapshot: (orgId: string) => liveSnapshot(orgId),
} satisfies LocationSeams;
