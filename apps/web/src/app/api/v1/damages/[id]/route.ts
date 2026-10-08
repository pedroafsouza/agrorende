import { rentalsCore } from "@/features/rentals/server";
import { ifMatch, OFFICE, param, readJson, route, write } from "@/lib/core.server";

/** Dispute, accept, waive or re-estimate a damage; `If-Match` guards concurrent edits. */
export const PATCH = route(OFFICE, async (request, ctx, params) => {
  const body = (await readJson(request)) as Parameters<typeof rentalsCore.updateDamage>[3];
  return write(ctx, (tx) => rentalsCore.updateDamage(tx, ctx, param(params, "id"), body, ifMatch(request)));
});
