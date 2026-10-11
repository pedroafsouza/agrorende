import { providersCore } from "@/features/providers/server";
import { OFFICE, param, route, write } from "@/lib/core.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `POST …/provider-invites/:inviteId/accept-counter`: accepts the provider counter-proposal (#64). */
export const POST = route(OFFICE, async (_request, ctx, params) => {
  return write(ctx, (tx) => providersCore.acceptCounter(tx, ctx, param(params, "id"), param(params, "inviteId")));
});
