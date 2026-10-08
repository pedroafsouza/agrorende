import { createHash } from "node:crypto";

import { AppError } from "@agrorende/contracts/errors";
import {
  CLOCK_SKEW_TOLERANCE_MS,
  PushRequestSchema,
  type MutationEnvelope,
  type MutationResult,
  type PushRequest,
  type PushResponse,
} from "@agrorende/contracts/sync";

import type { Ctx } from "../context.js";
import { notImplemented } from "../errors.js";
import { hasRole } from "../permissions.js";
import { getMutationHandler } from "./registry.js";
import { withSyncTx } from "./withSyncTx.js";
import type { MutationMeta, MutationOutcome } from "./types.js";

interface ProcessedMutationRecord {
  readonly userId: string;
  readonly requestHash: string;
  readonly result: MutationResult;
}

type RejectedMutationResult = Extract<MutationResult, { status: "REJECTED" }>;

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

function canonical(value: unknown): string {
  return JSON.stringify(stable(value));
}

function requestHash(envelope: MutationEnvelope): string {
  return createHash("sha256").update(canonical({ name: envelope.name, payload: envelope.payload })).digest("hex");
}

async function upsertDeviceStatus(_ctx: Ctx, _request: PushRequest, _receivedAt: Date): Promise<void> {
  return notImplemented("sync.push.upsertDeviceStatus");
}

async function readProcessedMutation(_ctx: Ctx, _mutationId: string): Promise<ProcessedMutationRecord | null> {
  return notImplemented("sync.push.readProcessedMutation");
}

async function storeAppliedMutation(_ctx: Ctx, _mutationId: string, _hash: string, _result: MutationResult): Promise<void> {
  return notImplemented("sync.push.storeAppliedMutation");
}

async function storeRejectedMutation(_ctx: Ctx, _mutationId: string, _hash: string, _result: MutationResult): Promise<void> {
  return notImplemented("sync.push.storeRejectedMutation");
}

async function snapshotForRejected(_ctx: Ctx, _envelope: MutationEnvelope): Promise<RejectedMutationResult["snapshot"]> {
  return notImplemented("sync.push.snapshotForRejected");
}

function toAppliedResult(envelope: MutationEnvelope, outcome: MutationOutcome): MutationResult {
  return {
    id: envelope.id,
    status: "APPLIED",
    ...(outcome.assigned === undefined ? {} : { assigned: outcome.assigned }),
  };
}

function toRejectedResult(envelope: MutationEnvelope, error: AppError, snapshot?: RejectedMutationResult["snapshot"]): MutationResult {
  return {
    id: envelope.id,
    status: "REJECTED",
    code: error.code,
    message: error.message,
    ...(error.details === undefined ? {} : { details: error.details as Record<string, unknown> }),
    ...(error.ref === undefined ? {} : { ref: error.ref }),
    ...(snapshot === undefined ? {} : { snapshot }),
  };
}

function validationRejected(envelope: MutationEnvelope, details?: unknown): MutationResult {
  return {
    id: envelope.id,
    status: "REJECTED",
    code: "VALIDATION_FAILED",
    message: "VALIDATION_FAILED",
    details: { details },
    snapshot: null,
  };
}

function metaFor(envelope: MutationEnvelope, request: PushRequest, receivedAt: Date): MutationMeta {
  const occurredAt = new Date(envelope.occurredAt);
  const clientTime = new Date(request.clientTime);
  const skewMs = receivedAt.getTime() - clientTime.getTime();
  const futureLimit = receivedAt.getTime() + CLOCK_SKEW_TOLERANCE_MS;
  const clockSkewed = occurredAt.getTime() > futureLimit;
  return {
    mutationId: envelope.id,
    deviceId: request.deviceId,
    occurredAt: clockSkewed ? receivedAt : occurredAt,
    receivedAt,
    ...(envelope.lat === undefined ? {} : { lat: envelope.lat }),
    ...(envelope.lng === undefined ? {} : { lng: envelope.lng }),
    clockSkewed: clockSkewed || Math.abs(skewMs) > CLOCK_SKEW_TOLERANCE_MS,
  };
}

async function applyEnvelope(ctx: Ctx, request: PushRequest, envelope: MutationEnvelope, receivedAt: Date): Promise<MutationResult> {
  const hash = requestHash(envelope);
  const processed = await readProcessedMutation(ctx, envelope.id);
  if (processed !== null) {
    if (processed.userId === ctx.userId && processed.requestHash === hash) {
      return processed.result;
    }
    return validationRejected(envelope, { reason: "mutationIdReuse" });
  }

  const handler = getMutationHandler(envelope.name);
  const parsed = handler.schema.safeParse(envelope.payload);
  if (!parsed.success) {
    return validationRejected(envelope, parsed.error.flatten());
  }
  if (!hasRole(ctx, handler.allowedRoles)) {
    return { id: envelope.id, status: "REJECTED", code: "FORBIDDEN", message: "FORBIDDEN", snapshot: null };
  }

  const meta = metaFor(envelope, request, receivedAt);
  try {
    const outcome = await withSyncTx(ctx, (tx) => handler.apply(tx, ctx, parsed.data, meta));
    const result = toAppliedResult(envelope, outcome);
    await storeAppliedMutation(ctx, envelope.id, hash, result);
    return result;
  } catch (error) {
    if (error instanceof AppError) {
      const snapshot = await snapshotForRejected(ctx, envelope);
      const result = toRejectedResult(envelope, error, snapshot);
      await storeRejectedMutation(ctx, envelope.id, hash, result);
      return result;
    }
    return { id: envelope.id, status: "RETRY" };
  }
}

export async function push(ctx: Ctx, input: unknown): Promise<PushResponse> {
  const request = PushRequestSchema.parse(input);
  const receivedAt = new Date();
  await upsertDeviceStatus(ctx, request, receivedAt);

  const results: MutationResult[] = [];
  for (const envelope of request.mutations) {
    const result = await applyEnvelope(ctx, request, envelope, receivedAt);
    results.push(result);
    if (result.status === "RETRY") {
      break;
    }
  }

  return { results, serverTime: receivedAt.toISOString() };
}
