import { partsCore } from "@/features/parts/server";
import { ifMatch, OFFICE, param, readJson, route, write } from "@/lib/core.server";

/** Edits or archives (`{archived: true}`) a catalog part; needs `If-Match`. */
export const PATCH = route(OFFICE, async (request, ctx, params) => {
  const body = await readJson(request);
  return write(ctx, (tx) => partsCore.updatePart(tx, ctx, param(params, "id"), body, ifMatch(request)));
});
