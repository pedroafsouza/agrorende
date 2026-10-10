import { withSyncTx as dbWithSyncTx } from "@agrorende/db";

import type { Ctx } from "../context";
import type { SyncTx } from "./types";

export async function withSyncTx<T>(
  ctx: Ctx,
  fn: (tx: SyncTx) => Promise<T>,
  dbOverride?: Parameters<typeof dbWithSyncTx>[2],
): Promise<T> {
  return dbWithSyncTx(ctx, async (dbTx: SyncTx) => {
    const tx: SyncTx = {
      ...dbTx,
      orgId: dbTx.orgId,
      db: dbTx.db,
    };
    return fn(tx);
  }, dbOverride);
}
