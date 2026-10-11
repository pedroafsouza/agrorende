import { providersCore } from "@/features/providers/server";
import { OFFICE, param, readJson, route, write } from "@/lib/core.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `POST …/provider-invites/:inviteId/review`: reviews a completed engagement once (#66). */
export const POST = route(OFFICE, async (request, ctx, params) => {
  const body = await readJson(request);
  return write(ctx, (tx) => providersCore.createReview(tx, ctx, param(params, "id"), param(params, "inviteId"), body));
});
