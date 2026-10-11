import { providersCore } from "@/features/providers/server";
import { OFFICE, param, readJson, route, write } from "@/lib/core.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `POST …/provider-reviews/:reviewId/reply`: the customer final reply, which closes the thread (#66). */
export const POST = route(OFFICE, async (request, ctx, params) => {
  const body = await readJson(request);
  return write(ctx, (tx) => providersCore.customerReplyToReview(tx, ctx, param(params, "id"), param(params, "reviewId"), body));
});
