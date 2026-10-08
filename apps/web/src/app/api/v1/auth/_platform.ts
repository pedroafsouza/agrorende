import "server-only";

/*
 * Thin adapter from Next.js route files to the framework-free T02 handlers in
 * `packages/core/src/auth/api`. `@agrorende/core` does not export that folder yet
 * (change request T02-002), so it is reached through a relative path in this one file.
 */
import { platformApi, type PlatformRouteKey } from "../../../../../../../packages/core/src/auth/api/index";

export interface PlatformRouteContext {
  readonly params?: Promise<Readonly<Record<string, string | string[]>>>;
}

export type PlatformRoute = (request: Request, context: PlatformRouteContext) => Promise<Response>;

export function platformRoute(key: PlatformRouteKey): PlatformRoute {
  return async (request, context) => {
    const raw = context.params === undefined ? {} : await context.params;
    const params: Record<string, string> = {};
    for (const [name, value] of Object.entries(raw)) params[name] = Array.isArray(value) ? value.join("/") : value;
    return platformApi[key](request, params);
  };
}
