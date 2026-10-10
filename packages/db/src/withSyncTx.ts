import { AppError } from "@agrorende/contracts/errors";
import type { ClientSession, Db } from "mongodb";

import { getClient, getDb } from "./client";
import { scoped, type ScopedDb, type TenantCtx } from "./scoped";
import type { SyncCounter, Uuid } from "./types";

export interface SyncTx {
  readonly session: ClientSession;
  readonly syncVersion: number;
  readonly orgId: Uuid;
  readonly db: ScopedDb;
}

export async function withSyncTx<T>(ctx: TenantCtx, fn: (tx: SyncTx) => Promise<T>, dbOverride?: Db): Promise<T> {
  const client = await getClient();
  const db = dbOverride ?? (await getDb());
  const session = client.startSession();
  try {
    return await session.withTransaction(
      async () => {
        const counter = await db.collection<SyncCounter>("sync_counters").findOneAndUpdate(
          { _id: ctx.orgId },
          { $inc: { value: 1 } },
          { session, returnDocument: "after" },
        );
        if (counter === null) throw new AppError("NOT_FOUND");
        return fn({ session, syncVersion: counter.value, orgId: ctx.orgId, db: scoped(ctx, db, session) });
      },
      {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
        readPreference: "primary",
        maxCommitTimeMS: 15_000,
      },
    );
  } finally {
    await session.endSession();
  }
}
