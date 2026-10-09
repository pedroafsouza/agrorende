import { daysAgo, deleteInChunks, type JobHandler } from "./index.js";

/**
 * `mutations.prune` (ARCHITECTURE §10 and §21.2, EC-SYN-29), daily at 03:30: APPLIED
 * `processed_mutations` are kept 30 days and REJECTED ones 90 days, so the attention queue and
 * the device conflict list keep rejected rows (with their resolution) long enough.
 */

export const APPLIED_RETENTION_DAYS = 30;
export const REJECTED_RETENTION_DAYS = 90;

export const handler: JobHandler = async (ctx) => {
  const target = ctx.platform.table("processed_mutations");
  const applied = await deleteInChunks(target, { "result.status": "APPLIED", processedAt: { $lt: daysAgo(ctx.now, APPLIED_RETENTION_DAYS) } });
  const rejected = await deleteInChunks(target, { "result.status": "REJECTED", processedAt: { $lt: daysAgo(ctx.now, REJECTED_RETENTION_DAYS) } });
  ctx.logger.info("mutations.prune", { applied, rejected });
  return { applied, rejected };
};
