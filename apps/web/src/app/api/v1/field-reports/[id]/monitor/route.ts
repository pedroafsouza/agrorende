import type { MonitorInput } from "@agrorende/core/modules/fieldReports/dto";

import { fieldReportsCore } from "@/features/reports/server";
import { OFFICE, param, readJson, route, write } from "@/lib/core.server";

export const POST = route(OFFICE, async (request, ctx, params) => {
  const body = (await readJson(request)) as MonitorInput;
  return write(ctx, (tx) => fieldReportsCore.monitor(tx, ctx, param(params, "id"), body));
});
