import { rentalsCore } from "@/features/rentals/server";
import { OFFICE, param, readJson, route, write } from "@/lib/core.server";

/** Opens a repair work order for the damage (F3 → F2); answers `{id, number}`. */
export const POST = route(OFFICE, async (request, ctx, params) => {
  const body = (await readJson(request)) as Parameters<typeof rentalsCore.createDamageWorkOrder>[3];
  return write(ctx, (tx) => rentalsCore.createDamageWorkOrder(tx, ctx, param(params, "id"), body));
});
