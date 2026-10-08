import { rentalsCore } from "@/features/rentals/server";
import { OFFICE, param, route, write } from "@/lib/core.server";

/** Only manual lines can be deleted; answers 204. */
export const DELETE = route(OFFICE, (_request, ctx, params) => write(ctx, (tx) => rentalsCore.deleteManualCharge(tx, ctx, param(params, "id"), param(params, "lineId"))));
