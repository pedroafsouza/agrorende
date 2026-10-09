import { billingCore } from "@/features/billing/server";
import { ifMatch, OFFICE, param, readJson, route, write } from "@/lib/core.server";

export const GET = route(OFFICE, (_request, ctx, params) => billingCore.getBillingDocument(ctx, param(params, "id")));

/** DRAFT only; `If-Match` carries the syncVersion the form was loaded with. */
export const PATCH = route(OFFICE, async (request, ctx, params) => {
  const body = (await readJson(request)) as Parameters<typeof billingCore.updateBillingDocument>[3];
  return write(ctx, (tx) => billingCore.updateBillingDocument(tx, ctx, param(params, "id"), body, ifMatch(request)));
});
