import { billingCore } from "@/features/billing/server";
import { OFFICE, query, route, write } from "@/lib/core.server";

/** Lines, customer and any active document a `workOrderId` or `rentalId` would bill; nothing is written. */
export const GET = route(OFFICE, (request, ctx) => {
  const q = query(request);
  const source = q.workOrderId === undefined ? (q.rentalId === undefined ? {} : { rentalId: q.rentalId }) : { workOrderId: q.workOrderId };
  return write(ctx, (tx) => billingCore.previewBillingLines(tx, ctx, source));
});
