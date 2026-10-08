import type { JobHandler } from "./index.js";

/**
 * `locations.prune` (ARCHITECTURE §10), daily at 03:15: safety pass next to the 30-day TTL
 * index on `location_pings.recordedAt`. Deletes in chunks through the core locations module.
 */
export const handler: JobHandler = async (ctx) => {
  const result = await ctx.platform.pruneLocationPings(ctx.now);
  ctx.logger.info("locations.prune", result);
  return result;
};
