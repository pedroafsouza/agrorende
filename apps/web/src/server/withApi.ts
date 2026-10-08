import { AppError, ERROR_META, getErrorHttpStatus, type AppErrorEnvelope, type ErrorCode } from "@agrorende/contracts/errors";
import type { HealthResponse } from "@agrorende/contracts/sync";
import type { MutationPayload } from "@agrorende/contracts/mutations";
import { verifyAccessToken, type Ctx, type DomainError } from "@agrorende/core";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export type RouteMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
export type ApiRole = "public" | "any" | "ADMIN" | "MANAGER" | "FIELD" | "ar_platform";

export interface ApiSession {
  readonly authenticated: boolean;
  readonly role?: Exclude<ApiRole, "public" | "any">;
  /** Set when an access token was presented but did not verify. */
  readonly invalidToken?: boolean;
}

export interface ApiContext {
  readonly requestId: string;
  readonly session: ApiSession;
  readonly core?: Ctx;
}

/**
 * The second argument Next.js passes to a route handler. Its `params` type is specific to each
 * route segment, so shared wrappers accept `unknown` (which the generated route type checks
 * accept for every segment) and narrow it with `routeContextOf`.
 */
export function routeContextOf(nextContext: unknown): ApiRouteContext {
  if (typeof nextContext === "object" && nextContext !== null && "params" in nextContext) {
    const params: unknown = nextContext.params;
    if (params instanceof Promise) {
      return { params: params as Promise<Readonly<Record<string, string | string[]>>> };
    }
  }
  return {};
}

export interface ApiRouteContext {
  readonly params?: Promise<Readonly<Record<string, string | string[]>>>;
}

export interface WithApiOptions {
  readonly roles?: readonly ApiRole[];
}

export interface NotImplementedEnvelope {
  readonly error: {
    readonly code: "NOT_IMPLEMENTED";
    readonly message: "NOT_IMPLEMENTED";
    readonly details: {
      readonly method: RouteMethod;
      readonly path: string;
      readonly mutationPayloadExample?: MutationPayload<"comment.create">;
    };
    readonly retryable: boolean;
    readonly ref: string;
  };
}

export type ApiDomainError = DomainError;

type ApiResult = NextResponse | HealthResponse | Readonly<Record<string, unknown>>;
type ApiHandler = (request: NextRequest, ctx: ApiContext, routeContext: ApiRouteContext) => ApiResult | Promise<ApiResult>;

function requestRef(request: NextRequest): string {
  const headerRef = request.headers.get("x-request-id");
  if (headerRef !== null && headerRef.trim().length >= 8) {
    return headerRef.trim().slice(0, 8).toUpperCase();
  }

  return crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
}

function accessToken(request: NextRequest): string | undefined {
  const cookie = request.cookies.get("ar_access")?.value;
  if (cookie !== undefined && cookie.length > 0) {
    return cookie;
  }

  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer ") === true && header.length > 7 ? header.slice(7) : undefined;
}

/**
 * Verifies the `ar_access` cookie or the bearer token and builds the core ctx from its claims
 * (change request T04-004). The platform console keeps its own `ar_platform` session, which its
 * routes verify themselves.
 */
async function readSession(request: NextRequest, requestId: string): Promise<{ session: ApiSession; core?: Ctx }> {
  const token = accessToken(request);
  if (token !== undefined) {
    try {
      const claims = await verifyAccessToken(token, { secret: process.env.JWT_SECRET ?? "" });
      const core: Ctx = {
        organizationId: claims.orgId,
        orgId: claims.orgId,
        userId: claims.sub,
        role: claims.role,
        deviceId: claims.deviceId ?? null,
        requestId,
      };
      return { session: { authenticated: true, role: claims.role }, core };
    } catch {
      if (!request.cookies.has("ar_platform")) {
        return { session: { authenticated: false, invalidToken: true } };
      }
    }
  }

  if (request.cookies.has("ar_platform")) {
    return { session: { authenticated: true, role: "ar_platform" } };
  }

  return { session: { authenticated: false } };
}

function isPublic(roles: readonly ApiRole[]): boolean {
  return roles.includes("public");
}

function apiError(code: ErrorCode, ref?: string): AppError {
  return new AppError(code, { ref });
}

function assertSession(session: ApiSession, roles: readonly ApiRole[], ref: string): void {
  if (isPublic(roles)) {
    return;
  }

  if (!session.authenticated) {
    throw apiError(session.invalidToken === true ? "TOKEN_EXPIRED" : "UNAUTHENTICATED", ref);
  }

  if (roles.includes("any")) {
    return;
  }

  if (session.role !== undefined && roles.includes(session.role)) {
    return;
  }

  const officeOnly = roles.every((role) => role === "ADMIN" || role === "MANAGER");
  throw apiError(session.role === "FIELD" && officeOnly ? "OFFICE_ROLE_REQUIRED" : "FORBIDDEN", ref);
}

function errorWithRef(error: AppError, ref: string): AppError {
  if (error.ref !== undefined) {
    return error;
  }

  return new AppError(error.code, { message: error.message, details: error.details, fieldErrors: error.fieldErrors, ref });
}

function toErrorResponse(error: unknown, ref: string): NextResponse<AppErrorEnvelope> {
  if (error instanceof AppError) {
    const appError = errorWithRef(error, ref);
    return NextResponse.json(appError.toEnvelope(), { status: getErrorHttpStatus(appError.code) });
  }

  const internal = new AppError("INTERNAL", { message: "INTERNAL", ref });
  return NextResponse.json(internal.toEnvelope(), { status: getErrorHttpStatus(internal.code) });
}

export function withApi(handler: ApiHandler, options: WithApiOptions = {}) {
  return async function routeHandler(request: NextRequest, nextContext: unknown): Promise<NextResponse> {
    const routeContext = routeContextOf(nextContext);
    const ref = requestRef(request);
    try {
      const roles = options.roles ?? ["any"];
      const { session, core } = isPublic(roles) ? { session: { authenticated: false }, core: undefined } : await readSession(request, ref);
      assertSession(session, roles, ref);
      const result = await handler(request, { requestId: ref, session, ...(core === undefined ? {} : { core }) }, routeContext);
      if (result instanceof NextResponse) {
        return result;
      }

      return NextResponse.json(result);
    } catch (error: unknown) {
      return toErrorResponse(error, ref);
    }
  };
}

export function notImplemented(method: RouteMethod, path: string) {
  return withApi(
    (_request, ctx) => ({
      error: {
        code: "NOT_IMPLEMENTED",
        message: "NOT_IMPLEMENTED",
        details: { method, path },
        retryable: ERROR_META.INTERNAL.retryable,
        ref: ctx.requestId,
      },
    }) satisfies NotImplementedEnvelope,
    { roles: ["public"] },
  );
}
