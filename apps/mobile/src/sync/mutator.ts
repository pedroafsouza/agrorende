import type { MediaMeta, MutationName } from "@agrorende/contracts/sync";
import { mutationPayloadSchema, type MutationPayload } from "@agrorende/contracts/mutations";

import { upsertMirrorRow } from "../db/mirror";
import type { SqlDb } from "../db/sql";
import { enqueue, listOutbox } from "./outbox";
import { getSyncRuntime, nowIso, type SyncRuntime } from "./runtime";

export type LocalMutationResult = { readonly mutationId: string };

export interface MutatorContext {
  readonly runtime: SyncRuntime;
  readonly mutationId: string;
  readonly now: string;
  /** True when a scope reset re-runs the mutator over a fresh server base (§7.6). */
  readonly replay: boolean;
}

export interface MutatorDefinition<N extends MutationName> {
  readonly name: N;
  readonly entityType: string;
  readonly entityId: (payload: MutationPayload<N>, runtime: SyncRuntime) => string;
  /** Optimistic local writes (`_dirty = 1`). Runs inside the outbox transaction. */
  readonly apply: (tx: SqlDb, payload: MutationPayload<N>, ctx: MutatorContext) => Promise<void>;
}

export interface MutatorOptions {
  readonly lat?: number;
  readonly lng?: number;
  readonly runtime?: SyncRuntime;
}

type AnyMutator = MutatorDefinition<MutationName>;

const registry = new Map<MutationName, AnyMutator>();

export function registeredMutator(name: MutationName): AnyMutator | undefined {
  return registry.get(name);
}

/**
 * Builds a mutator (ARCHITECTURE §7.2): validate the payload, write optimistic rows
 * and append the outbox command in one transaction, then nudge the engine.
 */
export function defineMutator<N extends MutationName>(definition: MutatorDefinition<N>) {
  registry.set(definition.name, definition as unknown as AnyMutator);
  return async function mutate(payload: MutationPayload<N>, options: MutatorOptions = {}): Promise<LocalMutationResult> {
    const runtime = options.runtime ?? getSyncRuntime();
    const parsed = mutationPayloadSchema(definition.name).parse(payload) as MutationPayload<N>;
    const mutationId = runtime.newId();
    const now = nowIso(runtime);
    await runtime.db.transaction(async (tx) => {
      await definition.apply(tx, parsed, { runtime, mutationId, now, replay: false });
      await enqueue(
        { id: mutationId, name: definition.name, entityType: definition.entityType, entityId: definition.entityId(parsed, runtime), payload: parsed, lat: options.lat, lng: options.lng, occurredAt: now },
        tx,
        now,
      );
    });
    runtime.kick();
    return { mutationId };
  };
}

/** Re-applies every pending or rejected-but-kept command over the current base, in client order. */
export async function replayPendingMutations(tx: SqlDb, runtime: SyncRuntime): Promise<number> {
  const rows = await listOutbox(tx, ["PENDING", "IN_FLIGHT"]);
  let replayed = 0;
  for (const row of rows) {
    const mutator = registry.get(row.name);
    if (mutator === undefined) continue;
    await mutator.apply(tx, row.payload as MutationPayload<MutationName>, { runtime, mutationId: row.id, now: row.occurredAt, replay: true });
    replayed += 1;
  }
  return replayed;
}

/** Optimistic `media` mirror rows for evidence attached by a mutation. */
export async function writeOptimisticMedia(tx: SqlDb, media: readonly MediaMeta[], ctx: MutatorContext): Promise<void> {
  for (const meta of media) {
    await upsertMirrorRow(
      tx,
      "media",
      {
        id: meta.id,
        organizationId: "",
        syncVersion: 0,
        createdAt: meta.capturedAt,
        updatedAt: ctx.now,
        kind: meta.kind,
        status: "PENDING",
        tag: meta.tag,
        mimeType: meta.mimeType,
        sizeBytes: meta.sizeBytes ?? null,
        durationMs: meta.durationMs ?? null,
        width: meta.width ?? null,
        height: meta.height ?? null,
        storageKey: "",
        variants: { original: { status: "PENDING" } },
        capturedAt: meta.capturedAt,
        capturedById: ctx.runtime.userId,
        lat: meta.lat ?? null,
        lng: meta.lng ?? null,
        parent: meta.parent,
        damageId: meta.damageId ?? null,
        checklistItemKey: meta.checklistItemKey ?? null,
        isLateEvidence: false,
      },
      1,
    );
  }
}
