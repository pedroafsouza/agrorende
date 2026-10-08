import { rentalsCore, rentalsQueries } from "@/features/rentals/server";
import { OFFICE, query, readJson, route, write } from "@/lib/core.server";

/** Office list: `status` (a RentalStatus or `OVERDUE`), `customerId`, `assetId`, `from`, `to`, `q`, `cursor`, `limit`. */
export const GET = route(OFFICE, (request, ctx) => rentalsQueries.listRentals(ctx, query(request)));

/** Creates a DRAFT rental (RN-01); `reserve` runs the eligibility check. */
export const POST = route(OFFICE, async (request, ctx) => {
  const body = (await readJson(request)) as Parameters<typeof rentalsCore.createRental>[2];
  return write(ctx, (tx) => rentalsCore.createRental(tx, ctx, body));
});
