import "server-only";

import type { Role } from "@agrorende/contracts/enums";
import { AppError } from "@agrorende/contracts/errors";
import { verifyAccessToken, withSyncTx, type Ctx } from "@agrorende/core";
import type { SyncTx } from "@agrorende/core";
import { NextResponse, type NextRequest } from "next/server";

import { withApi, type ApiRouteContext } from "@/server/withApi";

/* Typed adapter to the T04 core modules, reached through the `@agrorende/core/modules/*` export (T04-001). */
export * as assetsCore from "@agrorende/core/modules/assets/service";
export * as assetsQueries from "@agrorende/core/modules/assets/queries";
export * as sitesCore from "@agrorende/core/modules/sites/service";
export * as sitesQueries from "@agrorende/core/modules/sites/queries";
export * as seasonsCore from "@agrorende/core/modules/seasons/service";
export * as seasonsQueries from "@agrorende/core/modules/seasons/queries";
export * as customersCore from "@agrorende/core/modules/customers/service";
export * as customersQueries from "@agrorende/core/modules/customers/queries";
export * as checklistsCore from "@agrorende/core/modules/checklists/service";
export * as checklistsQueries from "@agrorende/core/modules/checklists/queries";

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

/** Thin route wrapper: `withApi` verifies the token and enforces the roles, then the handler's DTO as JSON. */
export function route(roles: readonly Role[], handler: Handler) {
  return withApi(
    async (request, api, routeContext: ApiRouteContext) => {
      const ctx: AuthedCtx = api.core === undefined ? await authenticate(request, roles, api.requestId) : { ...api.core, requestId: api.requestId };
      const raw = (await routeContext.params) ?? {};
      const params: Record<string, string> = {};
      for (const [key, value] of Object.entries(raw)) params[key] = Array.isArray(value) ? value.join("/") : String(value);
      const result = await handler(request, ctx, params);
      if (result instanceof NextResponse) return result;
      if (result === undefined) return new NextResponse(null, { status: 204 });
      return NextResponse.json(result);
    },
    { roles },
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
