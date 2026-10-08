import { collections, getDb } from "@agrorende/db";

import type { Ctx } from "../context.js";
import { notImplemented } from "../errors.js";
import type { SyncTx } from "../sync/types.js";

export type NumberSequencePrefix = "FR" | "WO" | "RN" | "BD" | "AGR";

export interface NumberingNextInput {
  readonly key: NumberSequencePrefix | string;
}

export async function next(ctx: Pick<Ctx, "orgId">, input: NumberingNextInput): Promise<number> {
  const db = await getDb();
  const result = await collections.numberSequences(db).findOneAndUpdate(
    { organizationId: ctx.orgId, key: input.key },
    { $inc: { value: 1 }, $setOnInsert: { organizationId: ctx.orgId, key: input.key } },
    { upsert: true, returnDocument: "after" },
  );
  if (result === null) {
    return notImplemented("numbering.next.result");
  }
  return result.value;
}

export async function nextNumber(_tx: SyncTx, _prefix: NumberSequencePrefix): Promise<string> {
  return notImplemented("numbering.nextNumber");
}
