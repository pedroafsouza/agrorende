import * as ops from "@agrorende/core/modules/ops/service";

import { OFFICE, route } from "@/lib/core.server";

export const GET = route(OFFICE, (_request, ctx) => ops.getAlerts(ctx));
