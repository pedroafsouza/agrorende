import { providersCore } from "@/features/providers/server";
import { OFFICE, param, readJson, route, write } from "@/lib/core.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `PATCH …/provider-invites/:inviteId/agreement`: the agreed value in cents and the expected payment method (#65). */
export const PATCH = route(OFFICE, async (request, ctx, params) => {
  const body = await readJson(request);
  return write(ctx, (tx) => providersCore.setAgreement(tx, ctx, param(params, "id"), param(params, "inviteId"), body));
});
