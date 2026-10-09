import type { LinkAssetInput } from "@agrorende/core/modules/fieldReports/dto";

import { fieldReportsCore } from "@/features/reports/server";
import { OFFICE, param, readJson, route, write } from "@/lib/core.server";

/** FR-22 (P1): links a report about an unregistered machine to an asset; office roles only. */
export const POST = route(OFFICE, async (request, ctx, params) => {
  const body = (await readJson(request)) as LinkAssetInput;
  return write(ctx, (tx) => fieldReportsCore.linkAsset(tx, ctx, param(params, "id"), body));
});
