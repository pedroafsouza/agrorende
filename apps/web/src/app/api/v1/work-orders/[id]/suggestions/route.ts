import { workOrdersSuggest } from "@/features/work-orders/server";
import { OFFICE, param, route, write } from "@/lib/core.server";

export const GET = route(OFFICE, (_request, ctx, params) => write(ctx, (tx) => workOrdersSuggest.suggestTechnicians(tx, ctx, { workOrderId: param(params, "id") })));
