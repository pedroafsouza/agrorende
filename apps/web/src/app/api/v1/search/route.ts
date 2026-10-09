import * as ops from "@agrorende/core/modules/ops/service";

import { OFFICE, query, route } from "@/lib/core.server";

/** `GET /search?q=`: top five matches per type for the ⌘K command palette (ARCHITECTURE §8, T16.3). */
export const GET = route(OFFICE, (request, ctx) => ops.search(ctx, query(request).q ?? null));
