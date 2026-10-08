import { rentalsCore } from "@/features/rentals/server";
import { ifMatch, OFFICE, param, route, write } from "@/lib/core.server";

/** Re-checks eligibility inside the sync transaction and rejects with the first code (EC-RN-01..05). */
export const POST = route(OFFICE, (request, ctx, params) => write(ctx, (tx) => rentalsCore.reserveRental(tx, ctx, param(params, "id"), ifMatch(request))));
