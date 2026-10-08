import { PlatformEnum } from "@agrorende/contracts/enums";
import { AppError } from "@agrorende/contracts/errors";
import { z } from "zod";

import { ACCESS_COOKIE, ACCESS_TOKEN_TTL_S, REFRESH_COOKIE, REFRESH_COOKIE_PATH, REFRESH_TOKEN_TTL_MS } from "../config.js";
import { clientIp, errorResponse, json, noContent, parseCookies, readBody, readJson, route, serializeCookie, type RouteHandler } from "../http.js";
import { authenticate, getSessionContext, readAccessToken } from "../session.js";
import {
  changePassword,
  deleteMe,
  login,
  lookupInvite,
  lookupReset,
  me,
  organizationDto,
  redeemInvitePassword,
  redeemReset,
  refresh,
  selfUserDto,
  socketToken,
  updateMe,
  type AuthResult,
} from "../service.js";
import { currentDeviceFamily, findRefreshRow, revokeDeviceSessions, revokeRefreshFamily } from "../tokens.js";

const LoginSchema = z.object({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(256),
  deviceId: z.string().min(8).max(64).optional(),
  platform: PlatformEnum.optional(),
});

const RefreshSchema = z.object({ refreshToken: z.string().min(16).max(512).optional() });

const InvitePasswordSchema = z.object({
  password: z.string().max(256),
  email: z.string().trim().max(254).optional(),
  deviceId: z.string().min(8).max(64).optional(),
  platform: PlatformEnum.optional(),
});

const PasswordSchema = z.object({ password: z.string().max(256) });
const ChangePasswordSchema = z.object({ current: z.string().max(256).optional(), next: z.string().max(256) });
const DeleteMeSchema = z.object({ confirm: z.string().max(40) });
const Code = z.string().trim().min(4).max(64);

function meta(request: Request, deviceId?: string | null) {
  return { ip: clientIp(request), userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null, deviceId: deviceId ?? null };
}

function sessionCookies(result: AuthResult): Headers {
  const headers = new Headers();
  headers.append("set-cookie", serializeCookie(ACCESS_COOKIE, result.session.accessToken, { path: "/", maxAgeS: ACCESS_TOKEN_TTL_S }));
  headers.append("set-cookie", serializeCookie(REFRESH_COOKIE, result.session.refreshToken, { path: REFRESH_COOKIE_PATH, maxAgeS: REFRESH_TOKEN_TTL_MS / 1000 }));
  return headers;
}

function clearCookies(headers: Headers = new Headers()): Headers {
  headers.append("set-cookie", serializeCookie(ACCESS_COOKIE, "", { path: "/", maxAgeS: 0 }));
  headers.append("set-cookie", serializeCookie(REFRESH_COOKIE, "", { path: REFRESH_COOKIE_PATH, maxAgeS: 0 }));
  return headers;
}

/** Web: cookies plus `{user, org}`. Mobile (`deviceId` or a body refresh token): the token pair, user and org. */
function authResponse(result: AuthResult, mobile: boolean): Response {
  const user = selfUserDto(result.user);
  const org = organizationDto(result.org, result.user);
  if (mobile) {
    return json({
      user,
      org,
      accessToken: result.session.accessToken,
      refreshToken: result.session.refreshToken,
      accessExpiresAt: result.session.accessExpiresAt.toISOString(),
      refreshExpiresAt: result.session.refreshExpiresAt.toISOString(),
    });
  }
  return json({ user, org }, { headers: sessionCookies(result) });
}

export const loginHandler: RouteHandler = route(async (request) => {
  const body = await readBody(request, LoginSchema);
  const result = await login(body, meta(request, body.deviceId));
  return authResponse(result, body.deviceId !== undefined);
});

export const refreshHandler: RouteHandler = route(async (request, _params, ref) => {
  const body = await readBody(request, RefreshSchema);
  const token = body.refreshToken ?? parseCookies(request).get(REFRESH_COOKIE);
  if (token === undefined || token.length === 0) throw new AppError("UNAUTHENTICATED");
  try {
    const result = await refresh(token, meta(request));
    return authResponse(result, body.refreshToken !== undefined);
  } catch (error) {
    if (body.refreshToken === undefined && error instanceof AppError) {
      const response = errorResponse(error, ref);
      clearCookies(response.headers);
      return response;
    }
    throw error;
  }
});

/** Logout never needs a valid access token: it revokes whatever refresh family or device session it can find. */
export const logoutHandler: RouteHandler = route(async (request) => {
  const body = (await readJson(request)) as { refreshToken?: unknown } | null;
  const fromBody = body !== null && typeof body === "object" && typeof body.refreshToken === "string" ? body.refreshToken : undefined;
  const token = fromBody ?? parseCookies(request).get(REFRESH_COOKIE);
  if (token !== undefined && token.length > 0) {
    await revokeRefreshFamily(token);
  } else {
    const access = readAccessToken(request);
    if (access !== null) {
      const ctx = await getSessionContext(access.token, { allowDrain: true, allowPasswordChange: true }).catch(() => null);
      if (ctx !== null && ctx.deviceId !== null && ctx.deviceId !== undefined) await revokeDeviceSessions(ctx.organizationId, ctx.userId, ctx.deviceId);
    }
  }
  return noContent(clearCookies());
});

export const meHandler: RouteHandler = route(async (request) => {
  const { ctx } = await authenticate(request, { allowPasswordChange: true });
  return json(await me(ctx));
});

export const updateMeHandler: RouteHandler = route(async (request) => {
  const { ctx } = await authenticate(request, { allowPasswordChange: true });
  return json(await updateMe(ctx, await readJson(request)));
});

export const deleteMeHandler: RouteHandler = route(async (request) => {
  const { ctx } = await authenticate(request, { allowPasswordChange: true });
  const body = await readBody(request, DeleteMeSchema);
  await deleteMe(ctx, body);
  return noContent(clearCookies());
});

export const changePasswordHandler: RouteHandler = route(async (request) => {
  const { ctx, viaCookie } = await authenticate(request, { allowPasswordChange: true });
  const body = await readBody(request, ChangePasswordSchema);
  let keep: string | undefined;
  const cookie = viaCookie ? parseCookies(request).get(REFRESH_COOKIE) : undefined;
  if (cookie !== undefined) keep = (await findRefreshRow(cookie))?.familyId;
  keep ??= await currentDeviceFamily(ctx.organizationId, ctx.userId, ctx.deviceId);
  await changePassword(ctx, body, keep);
  return noContent();
});

export const socketTokenHandler: RouteHandler = route(async (request) => {
  const { ctx } = await authenticate(request);
  return json(await socketToken(ctx));
});

export const inviteLookupHandler: RouteHandler = route(async (_request, params) => json(await lookupInvite(Code.parse(params.code))));

export const invitePasswordHandler: RouteHandler = route(async (request, params) => {
  const body = await readBody(request, InvitePasswordSchema);
  const result = await redeemInvitePassword(Code.parse(params.code), body, meta(request, body.deviceId));
  return authResponse(result, body.deviceId !== undefined);
});

export const resetLookupHandler: RouteHandler = route(async (_request, params) => json(await lookupReset(Code.parse(params.code))));

export const resetRedeemHandler: RouteHandler = route(async (request, params) => {
  const body = await readBody(request, PasswordSchema);
  await redeemReset(Code.parse(params.code), body);
  return noContent();
});

/**
 * Google and Apple sign-in need provider credentials that the MVP environment does not define;
 * the routes answer `OAUTH_PROVIDER_ERROR` so clients fall back to the password path
 * (docs/progress/T02.md, Gaps).
 */
export const oauthUnavailableHandler: RouteHandler = route(async () => {
  throw new AppError("OAUTH_PROVIDER_ERROR", { details: { reason: "not_configured" } });
});
