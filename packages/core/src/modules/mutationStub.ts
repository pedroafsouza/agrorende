import { reject } from "../errors";
import type { MutationHandler, MutationMeta, MutationOutcome, SyncTx } from "../sync/types";
import type { Ctx } from "../context";

/**
 * Apply function for a mutation whose module ships in wave 6. The push stores a per-envelope
 * `UNKNOWN_MUTATION` rejection instead of failing the batch, so the device keeps syncing.
 */
export function unavailableApply(name: string): MutationHandler<unknown>["apply"] {
  return async (_tx: SyncTx, _ctx: Ctx, _payload: unknown, _meta: MutationMeta): Promise<MutationOutcome> =>
    reject("UNKNOWN_MUTATION", { name, reason: "NOT_AVAILABLE" });
}
