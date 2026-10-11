import "server-only";

import { AppError } from "@agrorende/contracts/errors";
import type { ProviderLinkViewDTO } from "@agrorende/contracts";
import type { NextRequest } from "next/server";

import { withApi, type ApiRouteContext } from "@/server/withApi";

import { providerClientKey } from "./clientKey";

type LinkHandler = (token: string, body: unknown, options: { clientKey: string }) => Promise<ProviderLinkViewDTO>;

async function body(request: NextRequest): Promise<unknown> {
  if (request.method === "GET") return {};
  const text = await request.text();
  if (text.trim().length === 0) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError("VALIDATION_FAILED", { fieldErrors: [{ path: "", code: "invalid_json" }] });
  }
}

/**
 * Wraps a public magic-link endpoint (#64). No session is read: the token in the path is the only credential,
 * compared by hash in core and rate-limited per client address.
 */
export function providerLinkRoute(handler: LinkHandler) {
  return withApi(
    async (request, _api, routeContext: ApiRouteContext) => {
      const params = (await routeContext.params) ?? {};
      const raw = params.token;
      const token = Array.isArray(raw) ? raw.join("/") : (raw ?? "");
      return handler(token, await body(request), { clientKey: providerClientKey(request.headers) });
    },
    { roles: ["public"] },
  );
}
