import { notImplemented } from "../errors.js";
import type { MutationHandler, MutationMeta, MutationOutcome, SyncTx } from "../sync/types.js";
import type { Ctx } from "../context.js";

export function stubApply(feature: string): MutationHandler<unknown>["apply"] {
  return async (_tx: SyncTx, _ctx: Ctx, _payload: unknown, _meta: MutationMeta): Promise<MutationOutcome> =>
    notImplemented(feature);
}
