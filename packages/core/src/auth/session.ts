import type { Role } from "@agrorende/contracts/enums";
import { AppError } from "@agrorende/contracts/errors";
import { collections, getDb } from "@agrorende/db";

import type { Ctx } from "../context.js";
import { ACCESS_COOKIE, authConfig, DRAIN_SCOPE, DRAIN_TOKEN_TTL_MS } from "./config.js";
import { assertSameOrigin, parseCookies } from "./http.js";
import { verifyAccessToken, type AccessTokenClaims } from "./jwt.js";
import { isDisabled, signDrainToken } from "./tokens.js";

export interface SessionPrincipal {
  readonly userId: string;
  readonly organizationId: string;
  readonly role: Ctx["role"];
  readonly deviceId?: string | null;
}

export interface SessionOptions {
  /** Accept a `sync:drain` token (only `POST /sync/push` and media upload routes). */
  readonly allowDrain?: boolean;
  /** Accept a user whose `mustChangePassword` is set (change-password, me, logout). */
  readonly allowPasswordChange?: boolean;
}

export interface Session {
  readonly ctx: Ctx;
  readonly drain: boolean;
  readonly viaCookie: boolean;
}

function isExpired(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ERR_JWT_EXPIRED";
}

async function verify(token: string): Promise<AccessTokenClaims> {
  try {
    return await verifyAccessToken(token, { secret: authConfig().jwtSecret });
  } catch (error) {
    if (isExpired(error)) throw new AppError("TOKEN_EXPIRED");
    throw new AppError("UNAUTHENTICATED");
  }
}

async function resolveSession(token: string, options: SessionOptions): Promise<{ ctx: Ctx; drain: boolean }> {
  const claims = await verify(token);
  const drain = claims.scope === DRAIN_SCOPE;
  const user = await collections.users(await getDb()).findOne({ _id: claims.sub, organizationId: claims.orgId });
  if (user === null || (user.deletedAt !== null && user.deletedAt !== undefined)) throw new AppError("UNAUTHENTICATED");
  if (drain) {
    if (options.allowDrain !== true) throw new AppError("ACCOUNT_DISABLED", { details: { reason: "drain_scope" } });
  } else if (isDisabled(user)) {
    throw new AppError("ACCOUNT_DISABLED");
  } else if (user.mustChangePassword && options.allowPasswordChange !== true) {
    throw new AppError("PASSWORD_CHANGE_REQUIRED");
  }
  const ctx: Ctx = {
    organizationId: user.organizationId,
    orgId: user.organizationId,
    userId: user._id,
    role: user.role,
    deviceId: claims.deviceId ?? null,
  };
  return { ctx, drain };
}

/** Verifies an access token (JWT) against the live user row and returns the core `Ctx`. */
export async function getSessionContext(token: string, options: SessionOptions = {}): Promise<Ctx> {
  return (await resolveSession(token, options)).ctx;
}

/** Issues the one-off `sync:drain` token (72 h) for a disabled user's device. */
export async function issueDrainToken(principal: SessionPrincipal): Promise<string> {
  const now = new Date();
  return signDrainToken(principal, new Date(now.getTime() + DRAIN_TOKEN_TTL_MS), now);
}

export function readAccessToken(request: Request): { token: string; viaCookie: boolean } | null {
  const header = request.headers.get("authorization");
  if (header !== null && header.startsWith("Bearer ") && header.length > 7) return { token: header.slice(7).trim(), viaCookie: false };
  const cookie = parseCookies(request).get(ACCESS_COOKIE);
  if (cookie !== undefined && cookie.length > 0) return { token: cookie, viaCookie: true };
  return null;
}

export interface AuthenticateOptions extends SessionOptions {
  readonly roles?: readonly Role[];
}

/**
 * Authenticates a request by bearer token or `ar_access` cookie, applies the CSRF origin
 * check to cookie-authenticated mutations and enforces the role list.
 */
export async function authenticate(request: Request, options: AuthenticateOptions = {}): Promise<Session> {
  const found = readAccessToken(request);
  if (found === null) throw new AppError("UNAUTHENTICATED");
  if (found.viaCookie) assertSameOrigin(request);
  const { ctx, drain } = await resolveSession(found.token, options);
  if (options.roles !== undefined && !options.roles.includes(ctx.role)) {
    const officeOnly = options.roles.every((role) => role !== "FIELD");
    throw new AppError(officeOnly && ctx.role === "FIELD" ? "OFFICE_ROLE_REQUIRED" : "FORBIDDEN");
  }
  return { ctx, drain, viaCookie: found.viaCookie };
}
