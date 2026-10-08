import { workOrdersField } from "@/features/work-orders/server";
import { OFFICE, param, readJson, route, write } from "@/lib/core.server";

/** EC-WO-09: the office releases a job held for safety after review. */
export const POST = route(OFFICE, async (request, ctx, params) => {
  const body = (await request.clone().text()).trim().length === 0 ? {} : await readJson(request);
  return write(ctx, (tx) => workOrdersField.releaseSafetyHold(tx, ctx, param(params, "id"), body));
});
