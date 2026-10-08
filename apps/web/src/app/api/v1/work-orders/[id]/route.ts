import { workOrdersCore, workOrdersQueries } from "@/features/work-orders/server";
import { ifMatch, OFFICE, param, query, readJson, route, write } from "@/lib/core.server";

/** `?include=detail` adds parts, timeline, media and names for the office detail page. */
export const GET = route(OFFICE, (request, ctx, params) => {
  const id = param(params, "id");
  const detail = query(request).include === "detail";
  return detail ? write(ctx, (tx) => workOrdersQueries.detail(tx, ctx, id)) : write(ctx, (tx) => workOrdersQueries.get(tx, ctx, id));
});

export const PATCH = route(OFFICE, async (request, ctx, params) => {
  const body = await readJson(request);
  return write(ctx, (tx) => workOrdersCore.patch(tx, ctx, param(params, "id"), body, ifMatch(request)));
});
