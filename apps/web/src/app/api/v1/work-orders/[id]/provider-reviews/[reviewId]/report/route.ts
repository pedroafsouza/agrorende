import { providersCore } from "@/features/providers/server";
import { OFFICE, param, readJson, route, write } from "@/lib/core.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `POST …/provider-reviews/:reviewId/report`: flags the review for moderation (#66). */
export const POST = route(OFFICE, async (request, ctx, params) => {
  const body = await readJson(request);
  return write(ctx, (tx) => providersCore.reportReviewByCustomer(tx, ctx, param(params, "id"), param(params, "reviewId"), body));
});
