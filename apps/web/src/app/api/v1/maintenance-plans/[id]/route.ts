import { maintenanceCore } from "@/features/maintenance/server";
import { ifMatch, OFFICE, param, readJson, route, write } from "@/lib/core.server";

export const PATCH = route(OFFICE, async (request, ctx, params) => {
  const body = await readJson(request);
  return write(ctx, (tx) => maintenanceCore.updatePlan(tx, ctx, param(params, "id"), body, ifMatch(request)));
});
