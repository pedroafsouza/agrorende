import { CLOCK_SKEW_TOLERANCE_MS, PUSH_BATCH_MAX, type PushRequest, type PushResponse } from "@agrorende/contracts/sync";

import { applyMutationResult, jitteredBackoffMs } from "./apply";
import { buildDeviceStatus } from "./deviceStatus";
import { deferOutboxRow, markInFlight, nextPushBatch, resetInFlightOutbox } from "./outbox";
import { nowIso, type SyncRuntime } from "./runtime";
import { SYNC_STATE_KEYS, writeSyncState } from "./state";
import { TransportError } from "./transport";

export type PushTransport = { readonly push: (request: PushRequest) => Promise<PushResponse> };

export type PushStatus = "done" | "network" | "retry" | "unauthorized" | "rejectedBatch";

export interface PushOutcome {
  readonly status: PushStatus;
  readonly applied: number;
  readonly rejected: number;
  readonly retried: number;
  readonly batches: number;
  readonly errorCode?: string;
}

/** Records the server clock offset; skew beyond tolerance shows the clock banner (EC-SYN). */
export async function recordServerTime(runtime: SyncRuntime, serverTime: string): Promise<void> {
  const offset = Date.parse(serverTime) - runtime.clock.now();
  if (!Number.isFinite(offset)) return;
  await writeSyncState(runtime.db, SYNC_STATE_KEYS.serverOffsetMs, String(offset));
  runtime.store.setState({ serverOffsetMs: offset, clockSkewed: Math.abs(offset) > CLOCK_SKEW_TOLERANCE_MS });
}

/**
 * Push loop (§7.3): batches of up to 50 PENDING commands in client order. Each batch
 * is marked IN_FLIGHT with a `pushAttemptId`; network failures put it back to PENDING.
 */
export async function pushPendingMutations(runtime: SyncRuntime, maxBatches = 20): Promise<PushOutcome> {
  let applied = 0;
  let rejected = 0;
  let retried = 0;
  let batches = 0;
  while (batches < maxBatches) {
    const batch = await nextPushBatch(runtime.db, PUSH_BATCH_MAX, nowIso(runtime));
    if (batch.length === 0) break;
    batches += 1;
    const attemptId = runtime.newId();
    const startedAt = nowIso(runtime);
    await markInFlight(runtime.db, batch.map((row) => row.id), attemptId, startedAt);
    const request: PushRequest = {
      deviceId: runtime.deviceId,
      clientTime: startedAt,
      deviceStatus: await buildDeviceStatus(runtime),
      mutations: batch.map((row) => ({
        id: row.id,
        name: row.name,
        payload: row.payload,
        occurredAt: row.occurredAt,
        ...(row.lat === null ? {} : { lat: row.lat }),
        ...(row.lng === null ? {} : { lng: row.lng }),
      })),
    };

    let response: PushResponse;
    try {
      response = await runtime.api.push(request);
    } catch (error) {
      await resetInFlightOutbox(runtime.db);
      if (error instanceof TransportError && error.kind === "http") {
        if (error.status === 401) return { status: "unauthorized", applied, rejected, retried, batches, errorCode: error.code };
        // 429, 5xx and retryable envelope codes (ORG_SUSPENDED…) back off the whole batch.
        const nextAt = new Date(runtime.clock.now() + jitteredBackoffMs((batch[0]?.attempts ?? 0) + 1, runtime.random, error.retryAfterMs)).toISOString();
        await runtime.db.transaction(async (tx) => {
          for (const row of batch) await deferOutboxRow(tx, row.id, nextAt, error.code ?? `HTTP_${error.status}`);
        });
        return { status: "retry", applied, rejected, retried: retried + batch.length, batches, errorCode: error.code };
      }
      return { status: "network", applied, rejected, retried, batches, errorCode: error instanceof TransportError ? error.code : undefined };
    }

    let sawRetry = false;
    await runtime.db.transaction(async (tx) => {
      for (const result of response.results) {
        const outcome = await applyMutationResult(tx, result, runtime);
        if (outcome === "applied") applied += 1;
        if (outcome === "rejected") rejected += 1;
        if (outcome === "retry") {
          retried += 1;
          sawRetry = true;
        }
      }
    });
    // Commands the server did not answer stay queued for the next attempt.
    await resetInFlightOutbox(runtime.db);
    await recordServerTime(runtime, response.serverTime);
    if (sawRetry) return { status: "retry", applied, rejected, retried, batches };
  }
  return { status: "done", applied, rejected, retried, batches };
}
