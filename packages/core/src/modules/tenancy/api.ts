import { AppError } from "@agrorende/contracts/errors";
import type { ZodType } from "zod";

import { ACCESS_COOKIE, ACCESS_TOKEN_TTL_S, authConfig, REFRESH_COOKIE, REFRESH_COOKIE_PATH, REFRESH_TOKEN_TTL_MS } from "../../auth/config";
import { assertSameOrigin, clientIp, json, parseCookies, readJson, route, searchParams, serializeCookie, type RouteHandler } from "../../auth/http";
import { organizationDto, selfUserDto } from "../../auth/service";
import { authenticate } from "../../auth/session";
import { PLATFORM_COOKIE, PLATFORM_OAUTH_COOKIE, PLATFORM_SESSION_TTL_S } from "./config";
import {
  AdminResetLinkSchema,
  finishStaffGoogle,
  getPlatformOrg,
  listPlatformOrgs,
  patchPlatformOrg,
  platformAdminResetLink,
  PlatformListQuerySchema,
  PlatformPatchSchema,
  startStaffGoogle,
  verifyStaffSession,
  type OidcDeps,
} from "./platform";
import {
  AcceptTermsSchema,
  acceptTerms,
  cancelOrganization,
  CancelOrganizationSchema,
  getSubscription,
  signupOrganization,
  SignupOrganizationSchema,
} from "./service";

/** Parses a body and keeps custom refinement messages (`cnpj_invalid`, `timezone_invalid`) as field error codes. */
async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await readJson(request));
  if (parsed.success) return parsed.data;
  throw new AppError("VALIDATION_FAILED", {
    fieldErrors: parsed.error.issues.slice(0, 50).map((issue) => ({ path: issue.path.join("."), code: issue.code === "custom" ? issue.message : issue.code })),
  });
}

function strictCookie(name: string, value: string, maxAgeS: number, path = "/"): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, "SameSite=Strict", "HttpOnly"];
  if (authConfig().secureCookies) parts.push("Secure");
  parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeS))}`);
  return parts.join("; ");
}

// ---------------------------------------------------------------------------------------------
// Sign-up
// ---------------------------------------------------------------------------------------------

/** `POST /signup/organization`: web gets session cookies and `/ops`; app sign-ups get the deep link. */
export const signupOrganizationHandler: RouteHandler = route(async (request) => {
  assertSameOrigin(request);
  const input = await parseBody(request, SignupOrganizationSchema);
  const result = await signupOrganization(input, { ip: clientIp(request), userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null });
  if (result.session === null) {
    return json({ redirectTo: result.appRedirect, organizationId: result.organization._id }, { status: 201 });
  }
  const headers = new Headers();
  headers.append("set-cookie", serializeCookie(ACCESS_COOKIE, result.session.accessToken, { path: "/", maxAgeS: ACCESS_TOKEN_TTL_S }));
  headers.append("set-cookie", serializeCookie(REFRESH_COOKIE, result.session.refreshToken, { path: REFRESH_COOKIE_PATH, maxAgeS: REFRESH_TOKEN_TTL_MS / 1000 }));
  return json({ user: selfUserDto(result.user), org: organizationDto(result.organization, result.user), redirectTo: "/ops" }, { status: 201, headers });
});

// ---------------------------------------------------------------------------------------------
// Tenant subscription (ADMIN only)
// ---------------------------------------------------------------------------------------------

export const subscriptionHandler: RouteHandler = route(async (request) => {
  const { ctx } = await authenticate(request, { roles: ["ADMIN"] });
  return json(await getSubscription(ctx));
});

export const cancelHandler: RouteHandler = route(async (request) => {
  const { ctx } = await authenticate(request, { roles: ["ADMIN"] });
  return json(await cancelOrganization(ctx, await parseBody(request, CancelOrganizationSchema)));
});

export const acceptTermsHandler: RouteHandler = route(async (request) => {
  const { ctx } = await authenticate(request, { roles: ["ADMIN"] });
  return json(await acceptTerms(ctx, await parseBody(request, AcceptTermsSchema)));
});

// ---------------------------------------------------------------------------------------------
// Platform console (staff)
// ---------------------------------------------------------------------------------------------

let oidcDeps: OidcDeps = {};

/** Test seam: inject `fetch` and a JWKS resolver for the staff Google sign-in. */
export function setPlatformOidcDepsForTests(deps: OidcDeps | null): void {
  oidcDeps = deps ?? {};
}

/** Staff only: tenant bearer tokens and `ar_access` cookies never authenticate a platform route. */
async function staff(request: Request) {
  return verifyStaffSession(parseCookies(request).get(PLATFORM_COOKIE));
}

function appUrl(path: string): string {
  return `${authConfig().appUrl.replace(/\/$/, "")}${path}`;
}

function redirect(location: string, cookies: readonly string[] = []): Response {
  const headers = new Headers({ location, "cache-control": "no-store" });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(null, { status: 302, headers });
}

/** HTML hop so the SameSite=Strict cookie set on the cross-site callback is sent on the next same-site navigation. */
function htmlHop(location: string, cookies: readonly string[]): Response {
  const headers = new Headers({ "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  const safe = location.replace(/[^\w:/.?=&-]/g, "");
  return new Response(`<!doctype html><meta http-equiv="refresh" content="0;url=${safe}"><title>AgroRende</title><a href="${safe}">Continue</a>`, { status: 200, headers });
}

export const platformGoogleStartHandler: RouteHandler = async (request) => {
  try {
    const { url, stateCookie } = await startStaffGoogle({ loginHint: searchParams(request).get("login_hint") }, oidcDeps);
    const cookie = [`${PLATFORM_OAUTH_COOKIE}=${encodeURIComponent(stateCookie)}`, "Path=/api/v1/platform/auth", "SameSite=Lax", "HttpOnly", "Max-Age=600"];
    if (authConfig().secureCookies) cookie.push("Secure");
    return redirect(url, [cookie.join("; ")]);
  } catch (error) {
    const code = error instanceof AppError ? error.code : "INTERNAL";
    return redirect(appUrl(`/platform/login?error=${encodeURIComponent(code)}`));
  }
};

export const platformGoogleCallbackHandler: RouteHandler = async (request) => {
  const params = searchParams(request);
  const clearState = `${PLATFORM_OAUTH_COOKIE}=; Path=/api/v1/platform/auth; SameSite=Lax; HttpOnly; Max-Age=0`;
  try {
    if (params.get("error") !== null) throw new AppError("OAUTH_PROVIDER_ERROR", { details: { reason: "provider_denied" } });
    const result = await finishStaffGoogle({ code: params.get("code"), state: params.get("state"), stateCookie: parseCookies(request).get(PLATFORM_OAUTH_COOKIE) }, oidcDeps);
    return htmlHop(appUrl("/platform/orgs"), [clearState, strictCookie(PLATFORM_COOKIE, result.token, PLATFORM_SESSION_TTL_S)]);
  } catch (error) {
    const code = error instanceof AppError ? error.code : "INTERNAL";
    return redirect(appUrl(`/platform/login?error=${encodeURIComponent(code)}`), [clearState]);
  }
};

export const platformLogoutHandler: RouteHandler = route(async (request) => {
  assertSameOrigin(request);
  const headers = new Headers();
  headers.append("set-cookie", strictCookie(PLATFORM_COOKIE, "", 0));
  return new Response(null, { status: 204, headers });
});

export const platformOrgsHandler: RouteHandler = route(async (request) => {
  const session = await staff(request);
  const parsed = PlatformListQuerySchema.safeParse(Object.fromEntries(searchParams(request)));
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", { fieldErrors: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) });
  return json({ items: await listPlatformOrgs(session, parsed.data) });
});

export const platformOrgHandler: RouteHandler = route(async (request, params) => {
  const session = await staff(request);
  return json(await getPlatformOrg(session, params.id ?? ""));
});

export const platformPatchOrgHandler: RouteHandler = route(async (request, params) => {
  const session = await staff(request);
  assertSameOrigin(request);
  return json(await patchPlatformOrg(session, params.id ?? "", await parseBody(request, PlatformPatchSchema)));
});

export const platformAdminResetLinkHandler: RouteHandler = route(async (request, params) => {
  const session = await staff(request);
  assertSameOrigin(request);
  return json(await platformAdminResetLink(session, params.id ?? "", await parseBody(request, AdminResetLinkSchema)), { status: 201 });
});

/**
 * Framework-free handlers for every T20 REST route, keyed by `"<METHOD> <path pattern>"` as in
 * ARCHITECTURE §8. `apps/web` route files are thin adapters over this map.
 */
export const tenancyApi = {
  "POST /signup/organization": signupOrganizationHandler,
  "GET /org/subscription": subscriptionHandler,
  "POST /org/cancel": cancelHandler,
  "POST /org/accept-terms": acceptTermsHandler,
  "GET /platform/auth/google/start": platformGoogleStartHandler,
  "GET /platform/auth/google/callback": platformGoogleCallbackHandler,
  "POST /platform/auth/logout": platformLogoutHandler,
  "GET /platform/orgs": platformOrgsHandler,
  "GET /platform/orgs/:id": platformOrgHandler,
  "PATCH /platform/orgs/:id": platformPatchOrgHandler,
  "POST /platform/orgs/:id/admin-reset-link": platformAdminResetLinkHandler,
} as const satisfies Record<string, RouteHandler>;

export type TenancyRouteKey = keyof typeof tenancyApi;
