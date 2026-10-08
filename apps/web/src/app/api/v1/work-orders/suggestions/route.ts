import { workOrdersSuggest } from "@/features/work-orders/server";
import { OFFICE, query, route, write } from "@/lib/core.server";

/** `GET /work-orders/suggestions?fieldReportId=` — ranked technicians before the job exists (T06 mark-for-repair). */
export const GET = route(OFFICE, (request, ctx) => {
  const { fieldReportId } = query(request);
  return write(ctx, (tx) => workOrdersSuggest.suggestTechnicians(tx, ctx, fieldReportId ? { fieldReportId } : {}));
});
