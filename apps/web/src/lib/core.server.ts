import "server-only";

import type { Role } from "@agrorende/contracts/enums";
import { AppError } from "@agrorende/contracts/errors";
import { verifyAccessToken, withSyncTx, type Ctx } from "@agrorende/core";
import type { SyncTx } from "@agrorende/core";
import { NextResponse, type NextRequest } from "next/server";

import { withApi, type ApiRouteContext } from "@/server/withApi";

/*
 * Typed adapter to the T04 core modules. `@agrorende/core` does not export `modules/**` yet
 * (change request T04-001), so the services are reached through a relative path in this one
 * file. When the `./modules` export lands, only these lines change.
 */
export * as assetsCore from "../../../../packages/core/src/modules/assets/service";
export * as assetsQueries from "../../../../packages/core/src/modules/assets/queries";
export * as sitesCore from "../../../../packages/core/src/modules/sites/service";
export * as sitesQueries from "../../../../packages/core/src/modules/sites/queries";
export * as seasonsCore from "../../../../packages/core/src/modules/seasons/service";
export * as seasonsQueries from "../../../../packages/core/src/modules/seasons/queries";
export * as customersCore from "../../../../packages/core/src/modules/customers/service";
export * as customersQueries from "../../../../packages/core/src/modules/customers/queries";
export * as checklistsCore from "../../../../packages/core/src/modules/checklists/service";
export * as checklistsQueries from "../../../../packages/core/src/modules/checklists/queries";

export const OFFICE: readonly Role[] = ["ADMIN", "MANAGER"];
export const ADMIN_ONLY: readonly Role[] = ["ADMIN"];

export interface AuthedCtx extends Ctx {
  readonly requestId: string;
}

/** Verifies the `ar_access` cookie (or a bearer token) and builds the core ctx (ARCHITECTURE §8). */
export async function authenticate(request: NextRequest, roles: readonly Role[], requestId: string): Promise<AuthedCtx> {
  const header = request.headers.get("authorization");
  const token = request.cookies.get("ar_access")?.value ?? (header?.startsWith("Bearer ") === true ? header.slice(7) : undefined);
  if (token === undefined || token.length === 0) throw new AppError("UNAUTHENTICATED", { ref: requestId });
  const secret = process.env.JWT_SECRET ?? "";
  let claims;
  try {
    claims = await verifyAccessToken(token, { secret });
  } catch {
    throw new AppError("TOKEN_EXPIRED", { ref: requestId });
  }
  if (!roles.includes(claims.role)) {
    throw new AppError(claims.role === "FIELD" ? "OFFICE_ROLE_REQUIRED" : "FORBIDDEN", { ref: requestId });
  }
  return { organizationId: claims.orgId, orgId: claims.orgId, userId: claims.sub, role: claims.role, deviceId: claims.deviceId ?? null, requestId };
}

type Params = Readonly<Record<string, string>>;
type Handler = (request: NextRequest, ctx: AuthedCtx, params: Params) => Promise<unknown>;

/** Thin route wrapper: auth + role check, then the handler's DTO as JSON. */
export function route(roles: readonly Role[], handler: Handler) {
  return withApi(
    async (request, api, routeContext: ApiRouteContext) => {
      const ctx = await authenticate(request, roles, api.requestId);
      const raw = (await routeContext.params) ?? {};
      const params: Record<string, string> = {};
      for (const [key, value] of Object.entries(raw)) params[key] = Array.isArray(value) ? value.join("/") : String(value);
      const result = await handler(request, ctx, params);
      if (result instanceof NextResponse) return result;
      if (result === undefined) return new NextResponse(null, { status: 204 });
      return NextResponse.json(result);
    },
    { roles: ["any"] },
  );
}

export function write<T>(ctx: AuthedCtx, fn: (tx: SyncTx) => Promise<T>): Promise<T> {
  return withSyncTx(ctx, fn);
}

export async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return (await request.json()) as unknown;
  } catch {
    throw new AppError("VALIDATION_FAILED", { fieldErrors: [{ path: "", code: "invalid_json" }] });
  }
}

export function ifMatch(request: NextRequest): string | null {
  return request.headers.get("if-match");
}

export function query(request: NextRequest): Record<string, string> {
  return Object.fromEntries(request.nextUrl.searchParams.entries());
}

export function param(params: Params, key: string): string {
  const value = params[key];
  if (value === undefined) throw new AppError("NOT_FOUND", { details: { param: key } });
  return value;
}
