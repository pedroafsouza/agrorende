import { rentalsQueries } from "@/features/rentals/server";
import { OFFICE, query, route } from "@/lib/core.server";

/** Live eligibility for the create form (RN-02): `{eligible, codes[], warnings[]}`. */
export const GET = route(OFFICE, (request, ctx) => rentalsQueries.checkEligibility(ctx, query(request) as Parameters<typeof rentalsQueries.checkEligibility>[1]));
