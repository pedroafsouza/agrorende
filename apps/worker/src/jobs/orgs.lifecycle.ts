import type { JobHandler } from "./index.js";

interface LifecycleModule {
  runLifecycle(now: Date): Promise<{ changed: readonly { organizationId: string; from: string; to: string }[] }>;
}

/**
 * `orgs.lifecycle` (TEN-05, 03:10): TRIAL past `trialEndsAt` becomes PAST_DUE, and PAST_DUE for
 * 14 days becomes SUSPENDED. Each change emits `org:status` through the outbox.
 */
export const handler: JobHandler = async (ctx) => {
  const lifecycle = (await import("@agrorende/core/modules/tenancy/service")) as unknown as LifecycleModule;
  const result = await lifecycle.runLifecycle(ctx.now);
  for (const change of result.changed) ctx.logger.info("orgs.lifecycle.change", change);
  return { changed: result.changed.length };
};
