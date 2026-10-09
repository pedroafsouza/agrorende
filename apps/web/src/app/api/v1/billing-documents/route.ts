import { billingCore } from "@/features/billing/server";
import { OFFICE, query, readJson, route, write } from "@/lib/core.server";

/** Office list (ERP-08): `status`, `source`, `customerId`, `workOrderId`, `rentalId`, `cursor`, `limit`. */
export const GET = route(OFFICE, (request, ctx) => {
  const q = query(request);
  return billingCore.listBillingDocuments(ctx, { ...q, limit: q.limit === undefined ? null : Number(q.limit) });
});

/** Creates a DRAFT, prefilled from the work order or rental when one is given. */
export const POST = route(OFFICE, async (request, ctx) => {
  const body = (await readJson(request)) as Parameters<typeof billingCore.createBillingDocument>[2];
  return write(ctx, (tx) => billingCore.createBillingDocument(tx, ctx, body));
});
