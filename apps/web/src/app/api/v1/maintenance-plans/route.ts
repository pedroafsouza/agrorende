import { maintenanceCore } from "@/features/maintenance/server";
import { OFFICE, query, readJson, route, write } from "@/lib/core.server";

/** Plans with their target and due count: `?assetId=&includeInactive=true`. */
export const GET = route(OFFICE, (request, ctx) => {
  const q = query(request);
  return maintenanceCore.listPlans(ctx, { assetId: q.assetId ?? null, includeInactive: q.includeInactive === "true" });
});

export const POST = route(OFFICE, async (request, ctx) => {
  const body = await readJson(request);
  return write(ctx, (tx) => maintenanceCore.createPlan(tx, ctx, body));
});
