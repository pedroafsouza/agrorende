import type { MarkForRepairInput } from "@agrorende/core/modules/fieldReports/dto";

import { fieldReportsCore } from "@/features/reports/server";
import { OFFICE, param, readJson, route, write } from "@/lib/core.server";

/** 409 `ASSET_REPAIR_ALREADY_OPEN` carries the open work order in `details.workOrder` (EC-FR-15). */
export const POST = route(OFFICE, async (request, ctx, params) => {
  const body = (await readJson(request)) as MarkForRepairInput;
  return write(ctx, (tx) => fieldReportsCore.markForRepair(tx, ctx, param(params, "id"), body));
});
