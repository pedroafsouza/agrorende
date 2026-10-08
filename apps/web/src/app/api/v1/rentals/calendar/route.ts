import { rentalsQueries } from "@/features/rentals/server";
import { OFFICE, query, route } from "@/lib/core.server";

/** RN-11 availability: rentals overlapping `from`…`to`, optionally for one `assetId`. */
export const GET = route(OFFICE, (request, ctx) => rentalsQueries.rentalCalendar(ctx, query(request) as Parameters<typeof rentalsQueries.rentalCalendar>[1]));
