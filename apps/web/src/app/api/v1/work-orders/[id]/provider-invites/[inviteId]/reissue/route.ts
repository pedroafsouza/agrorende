import { providersCore } from "@/features/providers/server";
import { OFFICE, param, route, write } from "@/lib/core.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `POST …/provider-invites/:inviteId/reissue`: rotates the token; the previous link stops working (#63). */
export const POST = route(OFFICE, async (_request, ctx, params) => {
  return write(ctx, (tx) => providersCore.reissueInvite(tx, ctx, param(params, "id"), param(params, "inviteId")));
});
