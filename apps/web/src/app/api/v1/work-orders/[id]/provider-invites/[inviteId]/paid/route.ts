import { providersCore } from "@/features/providers/server";
import { OFFICE, param, route, write } from "@/lib/core.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `POST …/provider-invites/:inviteId/paid`: the customer confirms the off-platform payment (#65). */
export const POST = route(OFFICE, async (_request, ctx, params) => {
  return write(ctx, (tx) => providersCore.markPaidByCustomer(tx, ctx, param(params, "id"), param(params, "inviteId")));
});
