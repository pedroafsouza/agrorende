import "server-only";

/* Thin adapter from Next.js route files to the framework-free T20 handlers in `@agrorende/core/modules/tenancy/api`. */
import { tenancyApi, type TenancyRouteKey } from "@agrorende/core/modules/tenancy/api";
import { tenancyConfig } from "@agrorende/core/modules/tenancy/config";

import { routeContextOf } from "@/server/withApi";

/** The second argument is `unknown` so the route type check accepts every segment's params (see `routeContextOf`). */
export type TenancyRoute = (request: Request, context: unknown) => Promise<Response>;

export function tenancyRoute(key: TenancyRouteKey): TenancyRoute {
  return async (request, context) => {
    const routeContext = routeContextOf(context);
    const raw = routeContext.params === undefined ? {} : await routeContext.params;
    const params: Record<string, string> = {};
    for (const [name, value] of Object.entries(raw)) params[name] = Array.isArray(value) ? value.join("/") : value;
    return tenancyApi[key](request, params);
  };
}

/** `PLATFORM_SUPPORT_WHATSAPP` for the read-only banner (EC-OPS-29); null when unset. */
export function supportWhatsApp(): string | null {
  return tenancyConfig().supportWhatsApp;
}
