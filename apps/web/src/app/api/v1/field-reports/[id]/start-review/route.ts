import { fieldReportsCore } from "@/features/reports/server";
import { OFFICE, param, route, write } from "@/lib/core.server";

export const POST = route(OFFICE, (_request, ctx, params) => write(ctx, (tx) => fieldReportsCore.startReview(tx, ctx, param(params, "id"))));
