import type { Ctx } from "../context.js";
import { assertOrgWritable } from "../modules/tenancy/service.js";

/**
 * Office writes are refused with `ORG_SUSPENDED` while the organisation is SUSPENDED or CANCELLED
 * (TEN-03, TEN-04, EC-OPS-29). Field pushes use the grace-period gate in `sync/push.ts` instead.
 */
export async function assertOrganizationWritable(ctx: Pick<Ctx, "organizationId">): Promise<void> {
  await assertOrgWritable(ctx.organizationId);
}
