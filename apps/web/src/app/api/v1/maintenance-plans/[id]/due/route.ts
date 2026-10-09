import { maintenanceCore } from "@/features/maintenance/server";
import { OFFICE, param, route } from "@/lib/core.server";

/** Next due hour meter and date per asset of the plan. */
export const GET = route(OFFICE, (_request, ctx, params) => maintenanceCore.due(ctx, param(params, "id")));
