import * as ops from "@agrorende/core/modules/ops/service";

import { OFFICE, query, route } from "@/lib/core.server";

/** `GET /ops/analytics?metric=&from=&to=&seasonId=&groupBy=` (ARCHITECTURE §6.4, T16.1). */
export const GET = route(OFFICE, (request, ctx) => {
  const q = query(request);
  const locale = q.locale ?? request.cookies.get("NEXT_LOCALE")?.value ?? request.headers.get("accept-language") ?? "pt-BR";
  return ops.getAnalytics(ctx, {
    metric: q.metric ?? null,
    from: q.from ?? null,
    to: q.to ?? null,
    seasonId: q.seasonId ?? null,
    groupBy: q.groupBy ?? null,
    locale,
  });
});
