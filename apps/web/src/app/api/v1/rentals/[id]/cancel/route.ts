import { rentalsCore } from "@/features/rentals/server";
import { OFFICE, param, readJson, route, write } from "@/lib/core.server";

/** Body `{reason}`. */
export const POST = route(OFFICE, async (request, ctx, params) => {
  const body = (await readJson(request)) as Parameters<typeof rentalsCore.cancelRental>[3];
  return write(ctx, (tx) => rentalsCore.cancelRental(tx, ctx, param(params, "id"), body));
});
