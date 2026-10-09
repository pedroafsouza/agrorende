import "server-only";

/* Thin adapter from Next.js route files to the framework-free T02 handlers exported as `@agrorende/core/auth/api`. */
import { platformApi, type PlatformRouteKey } from "@agrorende/core/auth/api";

import { fastDispatch } from "@/server/fastDispatch";
import { routeContextOf } from "@/server/withApi";

/** The second argument is `unknown` so the route type check accepts every segment's params (see `routeContextOf`). */
export type PlatformRoute = (request: Request, context: unknown) => Promise<Response>;

export function platformRoute(key: PlatformRouteKey): PlatformRoute {
  return async (request, context) => {
    const routeContext = routeContextOf(context);
    const raw = routeContext.params === undefined ? {} : await routeContext.params;
    const params: Record<string, string> = {};
    for (const [name, value] of Object.entries(raw)) params[name] = Array.isArray(value) ? value.join("/") : value;
    try {
      return await platformApi[key](request, params);
    } finally {
      fastDispatch();
    }
  };
}
