import { rentalsQueries } from "@/features/rentals/server";
import { OFFICE, param, route } from "@/lib/core.server";

export const GET = route(OFFICE, (_request, ctx, params) => rentalsQueries.getInspection(ctx, param(params, "id")));
