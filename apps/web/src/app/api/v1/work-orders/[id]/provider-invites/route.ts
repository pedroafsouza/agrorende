import { providersCore } from "@/features/providers/server";
import { OFFICE, param, readJson, route, write } from "@/lib/core.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /work-orders/:id/provider-invites`: the external-provider invites of a work order, newest first (#63). */
export const GET = route(OFFICE, async (_request, ctx, params) => providersCore.listInvites(ctx, param(params, "id")));

/** `POST /work-orders/:id/provider-invites`: invites an external provider and returns the one-time magic link (#63). */
export const POST = route(OFFICE, async (request, ctx, params) => {
  const body = await readJson(request);
  return write(ctx, (tx) => providersCore.createInvite(tx, ctx, param(params, "id"), body));
});
