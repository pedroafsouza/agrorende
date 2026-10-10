import { randomUUID } from "node:crypto";

import { AppError, type ErrorCode } from "@agrorende/contracts/errors";
import { ZodError, type ZodType } from "zod";

import { noopLogger, type Logger } from "../logging";
import { authConfig } from "./config";

export type RouteParams = Readonly<Record<string, string>>;
/** Framework-free route handler: web standard `Request` in, `Response` out (ARCHITECTURE §8). */
export type RouteHandler = (request: Request, params: RouteParams) => Promise<Response>;

let logger: Logger = noopLogger;

export function setHttpLogger(value: Logger): void {
  logger = value;
}

export function requestRef(request: Request): string {
  const header = request.headers.get("x-request-id");
  if (header !== null && /^[A-Za-z0-9-]{8,}$/.test(header.trim())) return header.trim().slice(0, 8).toUpperCase();
  return randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
}

export function json(body: unknown, init: { readonly status?: number; readonly headers?: HeadersInit } = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

export function noContent(headers?: HeadersInit): Response {
  return new Response(null, { status: 204, headers });
}

function withRef(error: AppError, ref: string): AppError {
  if (error.ref !== undefined) return error;
  return new AppError(error.code, { message: error.message, details: error.details, fieldErrors: error.fieldErrors, ref });
}

export function errorResponse(error: unknown, ref: string): Response {
  let appError: AppError;
  if (error instanceof AppError) {
    appError = withRef(error, ref);
  } else if (error instanceof ZodError) {
    appError = validationError(error, ref);
  } else {
    logger.error("api.unhandled", { ref, error: error instanceof Error ? error.name : "unknown" });
    appError = new AppError("INTERNAL", { ref });
  }
  const headers = new Headers({ "x-request-id": ref });
  const details = appError.details;
  const retryAfter = typeof details === "object" && details !== null && "retryAfterMs" in details ? details.retryAfterMs : undefined;
  if (typeof retryAfter === "number") headers.set("retry-after", String(Math.ceil(retryAfter / 1000)));
  return json(appError.toEnvelope(), { status: appError.httpStatus, headers });
}

export function validationError(error: ZodError, ref?: string): AppError {
  return new AppError("VALIDATION_FAILED", {
    ref,
    fieldErrors: error.issues.slice(0, 50).map((issue) => ({ path: issue.path.join("."), code: issue.code })),
  });
}

export function fail(code: ErrorCode, details?: Readonly<Record<string, unknown>>): never {
  throw new AppError(code, details === undefined ? {} : { details });
}

/** Wraps a handler with the error envelope and the request ref header. */
export function route(handler: (request: Request, params: RouteParams, ref: string) => Promise<Response>): RouteHandler {
  return async (request, params) => {
    const ref = requestRef(request);
    try {
      const response = await handler(request, params, ref);
      response.headers.set("x-request-id", ref);
      return response;
    } catch (error) {
      return errorResponse(error, ref);
    }
  };
}

export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.trim().length === 0) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError("VALIDATION_FAILED", { fieldErrors: [{ path: "", code: "invalid_json" }] });
  }
}

export async function readBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

export function searchParams(request: Request): URLSearchParams {
  return new URL(request.url).searchParams;
}

export function parseCookies(request: Request): Map<string, string> {
  const cookies = new Map<string, string>();
  const header = request.headers.get("cookie");
  if (header === null) return cookies;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try {
      cookies.set(name, decodeURIComponent(value));
    } catch {
      cookies.set(name, value);
    }
  }
  return cookies;
}

export interface CookieOptions {
  readonly path?: string;
  readonly maxAgeS?: number;
  readonly httpOnly?: boolean;
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path ?? "/"}`, "SameSite=Lax"];
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (authConfig().secureCookies) parts.push("Secure");
  if (options.maxAgeS !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAgeS))}`);
  return parts.join("; ");
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded !== null && forwarded.length > 0) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

/** CSRF guard for cookie-authenticated mutations: `Origin` must equal `APP_URL` (ARCHITECTURE §11). */
export function assertSameOrigin(request: Request): void {
  if (request.method === "GET" || request.method === "HEAD") return;
  const origin = request.headers.get("origin");
  const expected = new URL(authConfig().appUrl).origin;
  if (origin === null || origin !== expected) {
    throw new AppError("FORBIDDEN", { details: { reason: "csrf" } });
  }
}

export interface PageParams {
  readonly offset: number;
  readonly limit: number;
}

/** Offset cursor paging for list endpoints: default 50, maximum 200 (ARCHITECTURE §8 "Lists"). */
export function pageParams(params: { readonly cursor?: string | null; readonly limit?: string | number | null }): PageParams {
  const offset = Number.parseInt(String(params.cursor ?? "0"), 10);
  const limit = Number.parseInt(String(params.limit ?? "50"), 10);
  return {
    offset: Number.isSafeInteger(offset) && offset >= 0 ? offset : 0,
    limit: Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 200) : 50,
  };
}

export function pageResult<T>(rows: readonly T[], page: PageParams): { items: T[]; nextCursor: string | null } {
  const items = rows.slice(0, page.limit);
  return { items, nextCursor: rows.length > page.limit ? String(page.offset + page.limit) : null };
}
