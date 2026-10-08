import { AppError, ERROR_META, getErrorHttpStatus, type AppErrorEnvelope, type ErrorCode } from "@agrorende/contracts/errors";
import type { HealthResponse } from "@agrorende/contracts/sync";
import type { MutationPayload } from "@agrorende/contracts/mutations";
import type { Ctx, DomainError } from "@agrorende/core";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export type RouteMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
export type ApiRole = "public" | "any" | "ADMIN" | "MANAGER" | "FIELD" | "ar_platform";

export interface ApiSession {
  readonly authenticated: boolean;
  readonly role?: Exclude<ApiRole, "public" | "any">;
}

export interface ApiContext {
  readonly requestId: string;
  readonly session: ApiSession;
  readonly core?: Ctx;
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

function readSession(request: NextRequest): ApiSession {
  if (request.cookies.has("ar_platform")) {
    return { authenticated: true, role: "ar_platform" };
  }

  if (request.cookies.has("ar_access")) {
    return { authenticated: true };
  }

  return { authenticated: false };
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
    throw apiError("UNAUTHENTICATED", ref);
  }

  if (roles.includes("any")) {
    return;
  }

  if (session.role !== undefined && roles.includes(session.role)) {
    return;
  }

  throw apiError("FORBIDDEN", ref);
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
  return async function routeHandler(request: NextRequest, routeContext: ApiRouteContext = {}): Promise<NextResponse> {
    const ref = requestRef(request);
    try {
      const session = readSession(request);
      assertSession(session, options.roles ?? ["any"], ref);
      const result = await handler(request, { requestId: ref, session }, routeContext);
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
