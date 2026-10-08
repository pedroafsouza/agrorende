import { readString, type JobHandler } from "./index.js";

/**
 * `exports.build` (T05.8, T05.11, EC-OPS-11): builds queued `ExportJob`s above the 50 000-row
 * streaming limit. The job runs on demand (data `{ jobId }`) and every minute as a poller,
 * because API routes cannot enqueue it yet (change request T05-006). Claiming is an atomic
 * update in the core exports module, so a job is built and notified once even when two
 * workers or a retry pick it up. Each run also expires downloads older than 7 days.
 */
export const handler: JobHandler = async (ctx, job) => {
  const jobId = readString(job.data, "jobId");
  const results = jobId === undefined ? [] : [await ctx.platform.exports.build(jobId)];
  results.push(...(await ctx.platform.exports.runQueued(5)));
  const expired = await ctx.platform.exports.expire();
  const summary = {
    built: results.filter((result) => result.built && result.status === "READY").length,
    failed: results.filter((result) => result.status === "FAILED").length,
    expired,
  };
  ctx.logger.info("exports.build", { jobId: job.id, ...summary });
  return summary;
};
