import type { MutationName } from "@agrorende/contracts/sync";

import { notImplemented } from "../lib/notImplemented";

export type EnqueueInput = { readonly id: string; readonly name: MutationName; readonly entityType: string; readonly entityId: string; readonly payload: unknown; readonly lat?: number; readonly lng?: number };
export async function enqueue(_input: EnqueueInput): Promise<never> { return notImplemented("sync.outbox.enqueue"); }
export async function resetInFlightOutbox(): Promise<never> { return notImplemented("sync.outbox.resetInFlightOutbox"); }
