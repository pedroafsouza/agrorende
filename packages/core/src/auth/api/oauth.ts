import { PlatformEnum } from "@agrorende/contracts/enums";
import { AppError } from "@agrorende/contracts/errors";
import { z } from "zod";

import { ACCESS_COOKIE, ACCESS_TOKEN_TTL_S, REFRESH_COOKIE, REFRESH_COOKIE_PATH, REFRESH_TOKEN_TTL_MS } from "../config.js";
import { clientIp, errorResponse, json, parseCookies, readBody, route, searchParams, serializeCookie, type RouteHandler } from "../http.js";
import {
  completeOAuth,
  errorRedirect,
  exchangeLoginCode,
  isCancelError,
  nativeAppleSignIn,
  OAUTH_COOKIE_PATH,
  OAUTH_START_LIMIT,
  OAUTH_STATE_TTL_S,
  OAuthCancelledError,
  oauthCookieName,
  peekOAuthState,
  readOAuthState,
  startOAuth,
  type OAuthClientKind,
  type OAuthIntent,
  type OAuthProviderId,
  type OAuthRedirectCode,
  type OAuthState,
} from "../oauth.js";
import { enforceRateLimit } from "../rateLimit.js";
import { organizationDto, selfUserDto, type AuthResult } from "../service.js";

/** Route handlers for Google and Apple sign-in (ARCHITECTURE §8 Auth rows). */

function meta(request: Request, deviceId?: string | null) {
  return { ip: clientIp(request), userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null, deviceId: deviceId ?? null };
}

function appBody(result: AuthResult): Response {
  return json({
    user: selfUserDto(result.user),
    org: organizationDto(result.org, result.user),
    accessToken: result.session.accessToken,
    refreshToken: result.session.refreshToken,
    accessExpiresAt: result.session.accessExpiresAt.toISOString(),
    refreshExpiresAt: result.session.refreshExpiresAt.toISOString(),
  });
}

function redirect(location: string, headers: Headers = new Headers()): Response {
  headers.set("location", location);
  headers.set("cache-control", "no-store");
  return new Response(null, { status: 303, headers });
}

function clearStateCookie(provider: OAuthProviderId, headers: Headers): Headers {
  headers.append("set-cookie", serializeCookie(oauthCookieName(provider), "", { path: OAUTH_COOKIE_PATH, maxAgeS: 0 }));
  return headers;
}

function redirectCode(error: unknown): OAuthRedirectCode {
  if (error instanceof OAuthCancelledError) return "OAUTH_CANCELLED";
  if (error instanceof AppError) return error.code;
  return "OAUTH_PROVIDER_ERROR";
}

const Provider = z.enum(["google", "apple"]);

function first(query: URLSearchParams, ...names: string[]): string | null {
  for (const name of names) {
    const value = query.get(name);
    if (value !== null && value.trim().length > 0) return value.trim();
  }
  return null;
}

function parseIntent(value: string | null): OAuthIntent {
  if (value === "signup") return "signup";
  if (value === "invite") return "invite";
  return "login";
}

/**
 * `GET /auth/oauth/:provider/start`: accepts the web query (`intent`, `inviteCode`, `next`) and
 * the app query (`client=app` or `redirect`/`appRedirectUri`, plus `challenge`/`codeChallenge`).
 */
export const oauthStartHandler: RouteHandler = route(async (request, params, ref) => {
  const providerParsed = Provider.safeParse(params.provider);
  if (!providerParsed.success) throw new AppError("NOT_FOUND", { details: { reason: "unknown_provider" } });
  const provider = providerParsed.data;
  const query = searchParams(request);
  const intent = parseIntent(first(query, "intent"));
  const appRedirectUri = first(query, "appRedirectUri", "redirect", "redirectUri");
  const client: OAuthClientKind = query.get("client") === "app" || appRedirectUri !== null ? "app" : "web";
  const fallback: Pick<OAuthState, "client" | "appRedirectUri" | "intent"> = { client: "web", appRedirectUri: null, intent };
  try {
    await enforceRateLimit(clientIp(request), OAUTH_START_LIMIT);
    const { url, binding } = await startOAuth({
      provider,
      intent,
      inviteCode: first(query, "inviteCode", intent === "invite" ? "code" : "inviteCode"),
      client,
      appRedirectUri,
      codeChallenge: first(query, "codeChallenge", "challenge"),
      next: first(query, "next"),
      loginHint: first(query, "loginHint", "login_hint"),
    });
    const headers = new Headers();
    headers.append("set-cookie", serializeCookie(oauthCookieName(provider), binding, { path: OAUTH_COOKIE_PATH, maxAgeS: OAUTH_STATE_TTL_S }));
    return redirect(url, headers);
  } catch (error) {
    // An app redirect that failed the allowlist is never followed; the app gets the JSON envelope.
    if (client === "app") return errorResponse(error, ref);
    return redirect(errorRedirect(fallback, redirectCode(error)));
  }
});

async function finishCallback(provider: OAuthProviderId, request: Request, values: URLSearchParams): Promise<Response> {
  const stateToken = values.get("state");
  const cookie = parseCookies(request).get(oauthCookieName(provider)) ?? null;
  const headers = clearStateCookie(provider, new Headers());
  let state: OAuthState;
  try {
    state = await readOAuthState(provider, stateToken, cookie);
  } catch (error) {
    const peeked = await peekOAuthState(stateToken);
    const providerError = values.get("error");
    const code: OAuthRedirectCode = providerError !== null && isCancelError(providerError) ? "OAUTH_CANCELLED" : redirectCode(error);
    return redirect(errorRedirect(peeked, code), headers);
  }
  try {
    const outcome = await completeOAuth(state, { code: values.get("code"), error: values.get("error"), user: values.get("user") }, meta(request));
    if (outcome.kind === "redirect") return redirect(outcome.location, headers);
    const { session } = outcome.result;
    headers.append("set-cookie", serializeCookie(ACCESS_COOKIE, session.accessToken, { path: "/", maxAgeS: ACCESS_TOKEN_TTL_S }));
    headers.append("set-cookie", serializeCookie(REFRESH_COOKIE, session.refreshToken, { path: REFRESH_COOKIE_PATH, maxAgeS: REFRESH_TOKEN_TTL_MS / 1000 }));
    return redirect(outcome.location, headers);
  } catch (error) {
    return redirect(errorRedirect(state, redirectCode(error)), headers);
  }
}

/** `GET /auth/oauth/google/callback`. */
export const googleCallbackHandler: RouteHandler = route(async (request) => finishCallback("google", request, searchParams(request)));

/** `POST /auth/oauth/apple/callback` (`response_mode=form_post`). */
export const appleCallbackHandler: RouteHandler = route(async (request) => {
  const values = new URLSearchParams(await request.text());
  return finishCallback("apple", request, values);
});

const ExchangeSchema = z.object({
  code: z.string().trim().min(16).max(4096),
  verifier: z.string().trim().min(43).max(128),
  deviceId: z.string().min(8).max(64),
  platform: PlatformEnum.optional(),
});

/** `POST /auth/oauth/exchange {code, verifier, deviceId, platform}`: the app token pair. */
export const oauthExchangeHandler: RouteHandler = route(async (request) => {
  const body = await readBody(request, ExchangeSchema);
  const result = await exchangeLoginCode(body, meta(request, body.deviceId));
  return appBody(result);
});

const AppleSchema = z.object({
  identityToken: z.string().min(16).max(8192),
  authorizationCode: z.string().min(1).max(2048),
  rawNonce: z.string().min(8).max(256),
  fullName: z
    .object({ givenName: z.string().max(80).nullable().optional(), familyName: z.string().max(80).nullable().optional() })
    .nullable()
    .optional(),
  deviceId: z.string().min(8).max(64),
  platform: PlatformEnum.optional(),
  intent: z.enum(["signin", "login", "signup", "invite"]).optional(),
  inviteCode: z.string().trim().min(4).max(64).optional(),
});

/** `POST /auth/apple`: native iOS Sign in with Apple. */
export const appleNativeHandler: RouteHandler = route(async (request) => {
  const body = await readBody(request, AppleSchema);
  await enforceRateLimit(clientIp(request), OAUTH_START_LIMIT);
  const result = await nativeAppleSignIn(
    {
      identityToken: body.identityToken,
      authorizationCode: body.authorizationCode,
      rawNonce: body.rawNonce,
      fullName: body.fullName ?? null,
      deviceId: body.deviceId,
      intent: parseIntent(body.intent ?? null),
      inviteCode: body.inviteCode ?? null,
    },
    meta(request, body.deviceId),
  );
  return appBody(result);
});
