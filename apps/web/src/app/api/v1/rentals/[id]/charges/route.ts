import { rentalsCore, rentalsQueries } from "@/features/rentals/server";
import { OFFICE, param, readJson, route, write } from "@/lib/core.server";

/** Charges view: lines, totals, deposit, balance, held damages and `chargesVersion` for close. */
export const GET = route(OFFICE, (_request, ctx, params) => rentalsQueries.getChargesView(ctx, param(params, "id")));

/** Adds a manual line (RN-09). */
export const POST = route(OFFICE, async (request, ctx, params) => {
  const body = (await readJson(request)) as Parameters<typeof rentalsCore.addManualCharge>[3];
  return write(ctx, (tx) => rentalsCore.addManualCharge(tx, ctx, param(params, "id"), body));
});
