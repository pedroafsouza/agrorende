import { providersCore } from "@/features/providers/server";
import { OFFICE, param, route, write } from "@/lib/core.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `POST …/provider-invites/:inviteId/revoke`: revokes the invite; the link shows the recovery page (#63). */
export const POST = route(OFFICE, async (_request, ctx, params) => {
  return write(ctx, (tx) => providersCore.revokeInvite(tx, ctx, param(params, "id"), param(params, "inviteId")));
});
