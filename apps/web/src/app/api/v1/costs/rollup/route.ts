import * as costs from "@agrorende/core/modules/costs/service";

import { OFFICE, query, route } from "@/lib/core.server";

export const GET = route(OFFICE, (request, ctx) => {
  const q = query(request);
  const locale = q.locale ?? request.cookies.get("NEXT_LOCALE")?.value ?? request.headers.get("accept-language") ?? "pt-BR";
  return costs.costRollup(ctx, {
    groupBy: q.groupBy ?? null,
    from: q.from ?? null,
    to: q.to ?? null,
    seasonId: q.seasonId ?? null,
    assetId: q.assetId ?? null,
    siteId: q.siteId ?? null,
    locale,
  });
});
