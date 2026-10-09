import { partsCore } from "@/features/parts/server";
import { query, route } from "@/lib/core.server";

const ANY_ROLE = ["ADMIN", "MANAGER", "FIELD"] as const;

/** `?locationId=&partId=&low=true`; a technician only sees warehouse and own-van levels. */
export const GET = route(ANY_ROLE, (request, ctx) => {
  const q = query(request);
  return partsCore.listLevels(ctx, { locationId: q.locationId ?? null, partId: q.partId ?? null, low: q.low === "true" });
});
