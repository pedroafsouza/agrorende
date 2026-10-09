import { billingCore } from "@/features/billing/server";
import { OFFICE, param, readJson, route, write } from "@/lib/core.server";

export const POST = route(OFFICE, async (request, ctx, params) => {
  const body = (await readJson(request)) as Parameters<typeof billingCore.payBillingDocument>[3];
  return write(ctx, (tx) => billingCore.payBillingDocument(tx, ctx, param(params, "id"), body));
});
