import { rentalsCore, rentalsQueries } from "@/features/rentals/server";
import { ifMatch, OFFICE, param, readJson, route, write } from "@/lib/core.server";

export const GET = route(OFFICE, (_request, ctx, params) => rentalsQueries.getRentalDetail(ctx, param(params, "id")));

/** DRAFT or RESERVED only; `If-Match` carries the syncVersion the form was loaded with. */
export const PATCH = route(OFFICE, async (request, ctx, params) => {
  const body = (await readJson(request)) as Parameters<typeof rentalsCore.updateRental>[3];
  return write(ctx, (tx) => rentalsCore.updateRental(tx, ctx, param(params, "id"), body, ifMatch(request)));
});
