import { partsCore } from "@/features/parts/server";
import { query, readJson, route, write } from "@/lib/core.server";

const ANY_ROLE = ["ADMIN", "MANAGER", "FIELD"] as const;

/** Ledger, newest first: `?partId=&locationId=&workOrderId=&limit=`. */
export const GET = route(ANY_ROLE, (request, ctx) => {
  const q = query(request);
  return partsCore.listMovements(ctx, {
    partId: q.partId ?? null,
    locationId: q.locationId ?? null,
    workOrderId: q.workOrderId ?? null,
    limit: q.limit === undefined ? null : Number(q.limit),
  });
});

/**
 * IN, TRANSFER and ADJUSTMENT by the office. Every role reaches the service so that a technician
 * gets `FORBIDDEN` (T14.2): FIELD stock only moves through `workOrder.addPart` on their own van.
 */
export const POST = route(ANY_ROLE, async (request, ctx) => {
  const body = await readJson(request);
  return write(ctx, (tx) => partsCore.createMovement(tx, ctx, body));
});
