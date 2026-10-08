import { workOrdersCore, workOrdersQueries } from "@/features/work-orders/server";
import { OFFICE, query, readJson, route, write } from "@/lib/core.server";

/** Office list with `status` (CSV or `active`), `assigneeId` (`none` = unassigned), `priority`, `siteId`, `assetId`, `due`, `q`. */
export const GET = route(OFFICE, (request, ctx) => {
  const { limit, ...rest } = query(request);
  return write(ctx, (tx) => workOrdersQueries.list(tx, ctx, { ...rest, limit: limit === undefined ? null : Number(limit) }));
});

/** Manual create (WO-20). Legacy `instructions` maps to `description`; `confirmOffDuty` answers EC-WO-19. */
export const POST = route(OFFICE, async (request, ctx) => {
  const body = await readJson(request);
  return write(ctx, (tx) => workOrdersCore.createManual(tx, ctx, body));
});
