import { workOrdersCore } from "@/features/work-orders/server";
import { ifMatch, OFFICE, param, readJson, route, write } from "@/lib/core.server";

export const PATCH = route(OFFICE, async (request, ctx, params) => {
  const body = await readJson(request);
  return write(ctx, (tx) => workOrdersCore.setExternalCost(tx, ctx, param(params, "id"), body, ifMatch(request)));
});
