import { rentalsCore } from "@/features/rentals/server";
import { OFFICE, param, route, write } from "@/lib/core.server";

export const POST = route(OFFICE, (_request, ctx, params) => write(ctx, (tx) => rentalsCore.recomputeCharges(tx, ctx, param(params, "id"))));
