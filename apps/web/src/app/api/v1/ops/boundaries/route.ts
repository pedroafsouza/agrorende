import * as ops from "@agrorende/core/modules/ops/service";

import { OFFICE, route } from "@/lib/core.server";

/** `GET /ops/boundaries`: plot boundaries as GeoJSON for the Ops map layer (T16.4). */
export const GET = route(OFFICE, (_request, ctx) => ops.plotBoundaries(ctx));
