import { partsCore } from "@/features/parts/server";
import { OFFICE, readJson, route, write } from "@/lib/core.server";

const ANY_ROLE = ["ADMIN", "MANAGER", "FIELD"] as const;

/** Warehouses and vans; a technician sees the warehouses and their own van. */
export const GET = route(ANY_ROLE, (_request, ctx) => partsCore.listLocations(ctx));

export const POST = route(OFFICE, async (request, ctx) => {
  const body = await readJson(request);
  return write(ctx, (tx) => partsCore.createLocation(tx, ctx, body));
});
