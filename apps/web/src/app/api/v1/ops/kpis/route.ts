import * as ops from "@agrorende/core/modules/ops/service";

import { OFFICE, query, route } from "@/lib/core.server";

export const GET = route(OFFICE, (request, ctx) => ops.getKpis(ctx, { range: query(request).range ?? null }));
