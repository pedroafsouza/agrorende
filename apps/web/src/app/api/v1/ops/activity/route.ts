import * as ops from "@agrorende/core/modules/ops/service";

import { OFFICE, query, route } from "@/lib/core.server";

export const GET = route(OFFICE, (request, ctx) => {
  const q = query(request);
  return ops.listActivity(ctx, { cursor: q.cursor ?? null, limit: q.limit ?? null });
});
