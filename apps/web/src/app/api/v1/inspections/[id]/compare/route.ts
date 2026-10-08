import { rentalsQueries } from "@/features/rentals/server";
import { OFFICE, param, route } from "@/lib/core.server";

/** Check-out and check-in of the same rental side by side, with their media and the rental's damages (RN-08). */
export const GET = route(OFFICE, (_request, ctx, params) => rentalsQueries.compareInspection(ctx, param(params, "id")));
