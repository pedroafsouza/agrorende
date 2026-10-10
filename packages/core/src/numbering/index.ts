import { AppError } from "@agrorende/contracts/errors";
import { collections, getDb } from "@agrorende/db";

import type { Ctx } from "../context";

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
    throw new AppError("INTERNAL", { message: "NUMBER_SEQUENCE_UPSERT_FAILED", details: { key: input.key } });
  }
  return result.value;
}

