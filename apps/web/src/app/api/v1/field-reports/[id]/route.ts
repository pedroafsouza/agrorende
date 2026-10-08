import { fieldReportsQueries } from "@/features/reports/server";
import { OFFICE, param, route } from "@/lib/core.server";

export const GET = route(OFFICE, (_request, ctx, params) => fieldReportsQueries.getFieldReportDetail(ctx, param(params, "id")));
