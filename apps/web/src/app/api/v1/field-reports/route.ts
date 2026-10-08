import { fieldReportsQueries } from "@/features/reports/server";
import { OFFICE, query, route } from "@/lib/core.server";

export const GET = route(OFFICE, (request, ctx) => fieldReportsQueries.listFieldReports(ctx, query(request)));
