import { rentalsQueries } from "@/features/rentals/server";
import { OFFICE, query, route } from "@/lib/core.server";

/** Damages filtered by `assetId`, `rentalId`, `open` (`true`/`false`), with `cursor` and `limit`. */
export const GET = route(OFFICE, (request, ctx) => {
  const { limit, ...rest } = query(request);
  return rentalsQueries.listDamages(ctx, { ...rest, ...(limit === undefined ? {} : { limit: Number(limit) }) } as Parameters<typeof rentalsQueries.listDamages>[1]);
});
