import { setExternalCostFromCompleted } from "@agrorende/core/modules/workOrders/external";

import { ifMatch, OFFICE, param, readJson, route, write } from "@/lib/core.server";

/** External cost (ERP-03 P1): from COMPLETED on; earlier states answer `INVALID_TRANSITION`. */
export const PATCH = route(OFFICE, async (request, ctx, params) => {
  const body = await readJson(request);
  return write(ctx, (tx) => setExternalCostFromCompleted(tx, ctx, param(params, "id"), body, ifMatch(request)));
});
