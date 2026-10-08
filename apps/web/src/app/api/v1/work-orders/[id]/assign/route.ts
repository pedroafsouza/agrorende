import { workOrdersCore } from "@/features/work-orders/server";
import { OFFICE, param, readJson, route, write } from "@/lib/core.server";

export const POST = route(OFFICE, async (request, ctx, params) => {
  const body = await readJson(request);
  return write(ctx, (tx) => workOrdersCore.assign(tx, ctx, param(params, "id"), body));
});
