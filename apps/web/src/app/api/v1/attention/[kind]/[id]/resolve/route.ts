import * as ops from "@agrorende/core/modules/ops/service";

import { OFFICE, param, readJson, route } from "@/lib/core.server";

export const POST = route(OFFICE, async (request, ctx, params) => {
  const body = (await readJson(request)) as { readonly note?: unknown } | null;
  return ops.resolveAttention(ctx, param(params, "kind"), param(params, "id"), { note: body?.note });
});
