import { rentalsCore } from "@/features/rentals/server";
import { OFFICE, param, readJson, route, write } from "@/lib/core.server";

/** Body `{paymentNote?, chargesVersion?}`; a stale `chargesVersion` answers RENTAL_CHARGES_UPDATED with the new totals. */
export const POST = route(OFFICE, async (request, ctx, params) => {
  const body = (await readJson(request)) as Parameters<typeof rentalsCore.closeRental>[3];
  return write(ctx, (tx) => rentalsCore.closeRental(tx, ctx, param(params, "id"), body));
});
