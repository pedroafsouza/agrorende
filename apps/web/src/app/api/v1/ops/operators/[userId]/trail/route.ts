import * as ops from "@agrorende/core/modules/ops/service";

import { OFFICE, param, query, route } from "@/lib/core.server";

export const GET = route(OFFICE, (request, ctx, params) => {
  const q = query(request);
  return ops.getOperatorTrail(ctx, param(params, "userId"), { from: q.from ?? null, to: q.to ?? null });
});
