import { createHash, randomUUID } from "node:crypto";

import { collections, getDb, platform, scoped } from "@agrorende/db";
import { AppError } from "@agrorende/contracts/errors";
import {
  CLOCK_SKEW_TOLERANCE_MS,
  MutationEnvelopeSchema,
  MutationNameEnum,
  PushRequestSchema,
  PUSH_BATCH_MAX,
  PUSH_BATCH_MIN,
  type MutationName,
  type MutationResult,
  type PushResponse,
  type TableName,
} from "@agrorende/contracts/sync";
import { z } from "zod";

import type { Ctx } from "../context.js";
import type { Logger } from "../logging.js";
import { hasRole } from "../permissions.js";
import { loadScopedRow } from "./pull.js";
import { mutationRegistry } from "./registry.js";
import { txDb } from "./touch.js";
import { withSyncTx } from "./withSyncTx.js";
import type { MutationHandler, MutationMeta, MutationOutcome, SyncTx } from "./types.js";

/** Envelope names are read leniently so an unknown name becomes a per-envelope UNKNOWN_MUTATION. */
const LenientEnvelopeSchema = MutationEnvelopeSchema.extend({ name: z.string().min(1) });
const LenientPushRequestSchema = PushRequestSchema.extend({
  mutations: z.array(LenientEnvelopeSchema).min(PUSH_BATCH_MIN).max(PUSH_BATCH_MAX),
});
type LenientEnvelope = z.infer<typeof LenientEnvelopeSchema>;
type LenientPushRequest = z.infer<typeof LenientPushRequestSchema>;

type RejectedMutationResult = Extract<MutationResult, { status: "REJECTED" }>;

export const ORG_SUSPENDED_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
export const ORG_SUSPENDED_RETRY_AFTER_MS = 60 * 60 * 1000;

/** Mutations a disabled user's drain token may still push (ARCHITECTURE §7.3 step 1). */
export const DRAIN_MUTATIONS: ReadonlySet<MutationName> = new Set<MutationName>([
  "fieldReport.create",
  "fieldReport.update",
  "media.register",
  "media.update",
  "comment.create",
  "workOrder.saveChecklist",
  "workOrder.complete",
  "inspection.submit",
  "rental.checkout",
  "rental.checkin",
]);

export interface PushOptions {
  /** The request was authenticated with a `sync:drain` token of a disabled user. */
  readonly drain?: boolean;
  readonly now?: Date;
  readonly logger?: Logger;
  /** Test seam: replaces the registry lookup. */
  readonly handlers?: Partial<Record<string, MutationHandler<unknown>>>;
}

interface ProcessedMutationRow {
  readonly _id: string;
  readonly userId: string;
  readonly requestHash: string;
  readonly result: MutationResult;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stable(item));
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return Object.fromEntries(entries.map(([key, item]) => [key, stable(item)]));
  }
  return value;
}

export function canonical(value: unknown): string {
  return JSON.stringify(stable(value));
}

export function requestHash(envelope: { readonly name: string; readonly payload: unknown }): string {
  return createHash("sha256").update(canonical({ name: envelope.name, payload: envelope.payload })).digest("hex");
}

function processedId(ctx: Ctx, mutationId: string): string {
  return `${ctx.organizationId}:${mutationId}`;
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000;
}

async function readProcessed(ctx: Ctx, mutationId: string): Promise<ProcessedMutationRow | null> {
  const db = await getDb();
  return collections.processedMutations(db).findOne({ _id: processedId(ctx, mutationId) });
}

async function upsertDeviceStatus(ctx: Ctx, request: LenientPushRequest, receivedAt: Date): Promise<void> {
  const db = await getDb();
  const status = request.deviceStatus;
  const skewMs = receivedAt.getTime() - new Date(request.clientTime).getTime();
  try {
    await scoped({ orgId: ctx.organizationId }, db).devices.updateOne(
      { installationId: request.deviceId, userId: ctx.userId },
      {
        $set: {
          appVersion: status.appVersion,
          runtimeVersion: status.runtimeVersion,
          pendingMutations: status.pendingMutations,
          pendingUploads: status.pendingUploads,
          pendingBytes: status.pendingBytes,
          oldestPendingAt: status.oldestPendingAt === undefined ? null : new Date(status.oldestPendingAt),
          batteryLevel: status.batteryLevel ?? null,
          freeStorageBytes: status.freeStorageBytes ?? null,
          scopeEpoch: status.scopeEpoch,
          clockOffsetMs: status.clockOffsetMs ?? skewMs,
          ...(status.pushStatus === undefined ? {} : { pushStatus: status.pushStatus }),
          lastSeenAt: receivedAt,
          updatedAt: receivedAt,
        },
        $setOnInsert: {
          _id: randomUUID(),
          platform: "ANDROID",
          lastPullVersion: 0,
          createdAt: receivedAt,
        },
      },
      { upsert: true },
    );
  } catch (error) {
    // A device id already registered to another organisation is not ours to update.
    if (!isDuplicateKey(error)) throw error;
  }
}

/** `null` when writes are accepted, otherwise the RETRY delay (ARCHITECTURE §7.3, ORG_SUSPENDED). */
export async function orgPushBackoff(ctx: Ctx, now: Date): Promise<number | null> {
  const db = await getDb();
  const org = await platform(db).organizations.findOne({ _id: ctx.organizationId }, { projection: { status: 1, suspendedAt: 1, cancelledAt: 1 } });
  if (org === null) return null;
  const since = org.status === "SUSPENDED" ? org.suspendedAt : org.status === "CANCELLED" ? org.cancelledAt : undefined;
  if (org.status !== "SUSPENDED" && org.status !== "CANCELLED") return null;
  if (since !== null && since !== undefined && now.getTime() - since.getTime() <= ORG_SUSPENDED_GRACE_MS) return null;
  return ORG_SUSPENDED_RETRY_AFTER_MS;
}

/** Which synced row a rejected mutation should rebase onto. */
export function snapshotTarget(ctx: Ctx, name: string, payload: unknown): { readonly table: TableName; readonly id: string } | null {
  const body = (payload ?? {}) as Record<string, unknown>;
  const str = (key: string): string | null => (typeof body[key] === "string" ? (body[key] as string) : null);
  const target = (table: TableName, id: string | null): { table: TableName; id: string } | null => (id === null ? null : { table, id });
  switch (name) {
    case "fieldReport.create":
    case "fieldReport.update":
    case "fieldReport.withdraw":
      return target("fieldReports", str("id"));
    case "media.register":
    case "media.update":
    case "media.delete":
      return target("media", str("id"));
    case "workOrder.transition":
    case "workOrder.complete":
    case "workOrder.saveChecklist":
      return target("workOrders", str("id"));
    case "workOrder.addPart":
      return target("workOrders", str("workOrderId"));
    case "workOrder.removePart":
      return target("workOrderParts", str("id"));
    case "comment.create":
      return target("comments", str("id"));
    case "inspection.submit":
      return target("inspections", str("id"));
    case "rental.checkout":
    case "rental.checkin":
      return target("rentals", str("rentalId"));
    case "asset.updateReadings":
      return target("assets", str("assetId"));
    case "user.setDuty":
      return target("users", ctx.userId);
    case "fuelLog.create":
      return target("fuelLogs", str("id"));
    default:
      return null;
  }
}

async function snapshotFor(ctx: Ctx, envelope: LenientEnvelope, now: Date): Promise<RejectedMutationResult["snapshot"]> {
  const target = snapshotTarget(ctx, envelope.name, envelope.payload);
  if (target === null) return null;
  const row = await loadScopedRow(ctx, target.table, target.id, now);
  return row === null ? null : { table: target.table, row };
}

function rejected(envelope: LenientEnvelope, code: RejectedMutationResult["code"], message: string, extra: Partial<RejectedMutationResult> = {}): RejectedMutationResult {
  return { id: envelope.id, status: "REJECTED", code, message, ...extra };
}

function fromAppError(envelope: LenientEnvelope, error: AppError, snapshot: RejectedMutationResult["snapshot"]): RejectedMutationResult {
  const details =
    error.details === undefined || error.details === null
      ? undefined
      : typeof error.details === "object" && !Array.isArray(error.details)
        ? (error.details as Record<string, unknown>)
        : { value: error.details };
  return rejected(envelope, error.code, error.message, {
    ...(details === undefined ? {} : { details }),
    ...(error.ref === undefined ? {} : { ref: error.ref }),
    snapshot,
  });
}

/** Domain rejections become REJECTED; INTERNAL and retryable codes are treated as transient. */
function isDomainRejection(error: unknown): error is AppError {
  return error instanceof AppError && error.code !== "INTERNAL" && !error.retryable;
}

export function metaFor(envelope: LenientEnvelope, request: { readonly deviceId: string; readonly clientTime: string }, receivedAt: Date): MutationMeta {
  const occurredAt = new Date(envelope.occurredAt);
  const clockSkewed = occurredAt.getTime() > receivedAt.getTime() + CLOCK_SKEW_TOLERANCE_MS;
  return {
    mutationId: envelope.id,
    deviceId: request.deviceId,
    occurredAt: clockSkewed ? receivedAt : occurredAt,
    receivedAt,
    ...(envelope.lat === undefined ? {} : { lat: envelope.lat }),
    ...(envelope.lng === undefined ? {} : { lng: envelope.lng }),
    clockSkewed,
  };
}

async function insertProcessed(
  tx: SyncTx,
  ctx: Ctx,
  request: LenientPushRequest,
  envelope: LenientEnvelope,
  hash: string,
  result: MutationResult,
  now: Date,
): Promise<void> {
  await txDb(tx).processed_mutations.insertOne({
    _id: processedId(ctx, envelope.id),
    organizationId: ctx.organizationId,
    mutationId: envelope.id,
    userId: ctx.userId,
    deviceId: request.deviceId,
    name: envelope.name,
    requestHash: hash,
    result,
    resolvedAt: null,
    syncVersion: tx.syncVersion,
    processedAt: now,
  });
}

/** Stores a result outside the handler transaction (pre-handler rejections and domain rejections). */
async function storeOutsideHandler(ctx: Ctx, request: LenientPushRequest, envelope: LenientEnvelope, hash: string, result: MutationResult, now: Date): Promise<MutationResult> {
  try {
    await withSyncTx(ctx, (tx) => insertProcessed(tx, ctx, request, envelope, hash, result, now));
    return result;
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    const stored = await readProcessed(ctx, envelope.id);
    return stored?.result ?? result;
  }
}

function outcomeResult(envelope: LenientEnvelope, outcome: MutationOutcome): MutationResult {
  return { id: envelope.id, status: "APPLIED", ...(outcome.assigned === undefined ? {} : { assigned: outcome.assigned }) };
}

async function applyEnvelope(ctx: Ctx, request: LenientPushRequest, envelope: LenientEnvelope, receivedAt: Date, options: PushOptions): Promise<MutationResult> {
  const hash = requestHash(envelope);
  const processed = await readProcessed(ctx, envelope.id);
  if (processed !== null) {
    if (processed.userId === ctx.userId && processed.requestHash === hash) {
      return processed.result;
    }
    return rejected(envelope, "VALIDATION_FAILED", "VALIDATION_FAILED", { details: { context: "mutationIdReuse" }, snapshot: null });
  }

  const known = MutationNameEnum.safeParse(envelope.name);
  const handler = options.handlers?.[envelope.name] ?? (known.success ? mutationRegistry[known.data] : undefined);
  if (handler === undefined) {
    return storeOutsideHandler(ctx, request, envelope, hash, rejected(envelope, "UNKNOWN_MUTATION", "UNKNOWN_MUTATION", { details: { name: envelope.name }, snapshot: null }), receivedAt);
  }
  if (options.drain === true && !(known.success && DRAIN_MUTATIONS.has(known.data))) {
    return rejected(envelope, "ACCOUNT_DISABLED", "ACCOUNT_DISABLED", { details: { context: "drain" }, snapshot: null });
  }
  const parsed = handler.schema.safeParse(envelope.payload);
  if (!parsed.success) {
    return storeOutsideHandler(
      ctx,
      request,
      envelope,
      hash,
      rejected(envelope, "VALIDATION_FAILED", "VALIDATION_FAILED", { details: { issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) }, snapshot: null }),
      receivedAt,
    );
  }
  if (!hasRole(ctx, handler.allowedRoles)) {
    return storeOutsideHandler(ctx, request, envelope, hash, rejected(envelope, "FORBIDDEN", "FORBIDDEN", { snapshot: await snapshotFor(ctx, envelope, receivedAt) }), receivedAt);
  }

  const meta = metaFor(envelope, request, receivedAt);
  try {
    return await withSyncTx(ctx, async (tx) => {
      const outcome = await handler.apply(tx, ctx, parsed.data, meta);
      const result = outcomeResult(envelope, outcome);
      await insertProcessed(tx, ctx, request, envelope, hash, result, receivedAt);
      return result;
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      const stored = await readProcessed(ctx, envelope.id);
      if (stored !== null) return stored.result;
      throw error;
    }
    if (isDomainRejection(error)) {
      const snapshot = await snapshotFor(ctx, envelope, receivedAt);
      return storeOutsideHandler(ctx, request, envelope, hash, fromAppError(envelope, error, snapshot), receivedAt);
    }
    throw error;
  }
}

/** `POST /api/v1/sync/push` (ARCHITECTURE §7.3). Envelopes are applied in order; the first RETRY stops the batch. */
export async function push(ctx: Ctx, input: unknown, options: PushOptions = {}): Promise<PushResponse> {
  const request = LenientPushRequestSchema.parse(input);
  const receivedAt = options.now ?? new Date();
  await upsertDeviceStatus(ctx, request, receivedAt);

  const backoff = await orgPushBackoff(ctx, receivedAt);
  if (backoff !== null) {
    const first = request.mutations[0];
    return {
      results: first === undefined ? [] : [{ id: first.id, status: "RETRY", retryAfterMs: backoff }],
      serverTime: receivedAt.toISOString(),
    };
  }

  const results: MutationResult[] = [];
  for (const envelope of request.mutations) {
    let result: MutationResult;
    try {
      result = await applyEnvelope(ctx, request, envelope, receivedAt, options);
    } catch (error) {
      options.logger?.error("sync.push.retry", { mutationId: envelope.id, name: envelope.name, requestId: ctx.requestId }, error);
      result = { id: envelope.id, status: "RETRY" };
    }
    results.push(result);
    if (result.status === "RETRY") {
      break;
    }
  }

  return { results, serverTime: receivedAt.toISOString() };
}
