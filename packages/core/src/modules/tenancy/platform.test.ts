import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { setAuthConfigForTests } from "../../auth/config";
import { memoryRateLimiter, setRateLimiter } from "../../auth/rateLimit";
import { signAccess } from "../../auth/tokens";
import { setPlatformOidcDepsForTests, tenancyApi, type TenancyRouteKey } from "./api";
import { setTenancyConfigForTests } from "./config";
import { issueStaffSession } from "./platform";
import { createTenancyDb, SEED, type TenancyTestDb } from "./testing";

const BASE = "http://localhost:3000";
const ISSUER = "http://localhost:4003/google";
const CLIENT_ID = "agrorende-web";
let db: TenancyTestDb;
let privateKey: CryptoKey;
let publicJwk: JWK;
let idTokenClaims: Record<string, unknown> = {};

function cookieValue(response: Response, name: string): string | null {
  const header = response.headers.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
  for (const line of header) {
    if (line.startsWith(`${name}=`)) return decodeURIComponent(line.slice(name.length + 1).split(";")[0] ?? "");
  }
  return null;
}

async function call(
  key: TenancyRouteKey,
  options: { body?: unknown; cookies?: Record<string, string>; bearer?: string; params?: Record<string, string>; query?: Record<string, string>; origin?: string } = {},
): Promise<Response> {
  const [method = "GET", pattern = "/"] = key.split(" ");
  const pathname = pattern.replace(/:(\w+)/g, (_, name: string) => options.params?.[name] ?? "");
  const url = new URL(`/api/v1${pathname}`, BASE);
  for (const [name, value] of Object.entries(options.query ?? {})) url.searchParams.set(name, value);
  const headers = new Headers({ origin: options.origin ?? BASE });
  if (options.cookies !== undefined) headers.set("cookie", Object.entries(options.cookies).map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; "));
  if (options.bearer !== undefined) headers.set("authorization", `Bearer ${options.bearer}`);
  let body: string | undefined;
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.body);
  }
  return tenancyApi[key](new Request(url, { method, headers, body }), options.params ?? {});
}

const fakeFetch = async (input: string, init?: RequestInit): Promise<Response> => {
  if (input === `${ISSUER}/.well-known/openid-configuration`) {
    return Response.json({ issuer: ISSUER, authorization_endpoint: `${ISSUER}/authorize`, token_endpoint: `${ISSUER}/token`, jwks_uri: `${ISSUER}/jwks` });
  }
  if (input === `${ISSUER}/token`) {
    const form = new URLSearchParams(String(init?.body ?? ""));
    if (form.get("code") !== "good-code" || (form.get("code_verifier") ?? "").length < 43) return new Response("bad", { status: 400 });
    const now = Math.floor(Date.now() / 1000);
    const idToken = await new SignJWT({ email_verified: true, ...idTokenClaims })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setSubject("staff-sub")
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .sign(privateKey);
    return Response.json({ id_token: idToken, access_token: "x", token_type: "Bearer" });
  }
  return new Response("not found", { status: 404 });
};

async function signIn(email: string): Promise<Response> {
  const start = await call("GET /platform/auth/google/start", { query: { login_hint: email } });
  expect(start.status).toBe(302);
  const location = new URL(start.headers.get("location") ?? "");
  expect(location.searchParams.get("code_challenge_method")).toBe("S256");
  expect(location.searchParams.get("redirect_uri")).toBe(`${BASE}/api/v1/platform/auth/google/callback`);
  const stateCookie = cookieValue(start, "ar_platform_oauth") ?? "";
  idTokenClaims = { email, nonce: location.searchParams.get("nonce") };
  return call("GET /platform/auth/google/callback", { query: { code: "good-code", state: location.searchParams.get("state") ?? "" }, cookies: { ar_platform_oauth: stateCookie } });
}

beforeAll(async () => {
  setAuthConfigForTests({ jwtSecret: "t20-platform-test-secret-0123456789abcdef", redisUrl: null, appUrl: BASE });
  setTenancyConfigForTests({ platformAdminEmails: ["staff@agrorende.dev"], google: { clientId: CLIENT_ID, clientSecret: "secret", issuer: ISSUER } });
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey as CryptoKey;
  publicJwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256" };
  setPlatformOidcDepsForTests({ fetch: fakeFetch, jwks: createLocalJWKSet({ keys: [publicJwk] }) });
  db = await createTenancyDb("platform");
}, 60_000);

beforeEach(() => setRateLimiter(memoryRateLimiter()));

afterAll(async () => {
  setPlatformOidcDepsForTests(null);
  setTenancyConfigForTests(null);
  setAuthConfigForTests(null);
  await db?.close();
});

describe("staff Google sign-in", () => {
  it("issues a SameSite=Strict ar_platform cookie for an allow-listed staff e-mail", async () => {
    const response = await signIn("staff@agrorende.dev");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("/platform/orgs");
    const cookies = response.headers.getSetCookie();
    const platform = cookies.find((line) => line.startsWith("ar_platform="));
    expect(platform).toContain("SameSite=Strict");
    expect(platform).toContain("HttpOnly");
    expect(platform).toContain("Max-Age=28800");
  });

  it("refuses e-mails that are not in PLATFORM_ADMIN_EMAILS", async () => {
    const response = await signIn("someone@example.com");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${BASE}/platform/login?error=FORBIDDEN`);
    expect(cookieValue(response, "ar_platform")).toBeNull();
  });

  it("refuses a wrong nonce and a missing state cookie", async () => {
    const start = await call("GET /platform/auth/google/start");
    const location = new URL(start.headers.get("location") ?? "");
    idTokenClaims = { email: "staff@agrorende.dev", nonce: "other" };
    const wrongNonce = await call("GET /platform/auth/google/callback", {
      query: { code: "good-code", state: location.searchParams.get("state") ?? "" },
      cookies: { ar_platform_oauth: cookieValue(start, "ar_platform_oauth") ?? "" },
    });
    expect(wrongNonce.headers.get("location")).toContain("error=OAUTH_STATE_EXPIRED");
    const noState = await call("GET /platform/auth/google/callback", { query: { code: "good-code", state: "x" } });
    expect(noState.headers.get("location")).toContain("error=OAUTH_STATE_EXPIRED");
  });
});

describe("platform console API", () => {
  let staff: string;

  beforeAll(async () => {
    staff = (await issueStaffSession("staff@agrorende.dev")).token;
  });

  it("rejects tenant tokens and missing cookies with UNAUTHENTICATED", async () => {
    const admin = await db.raw("users").findOne({ _id: SEED.admin });
    const tenant = (await signAccess(admin as never, null)).token;
    const attempts: { bearer?: string; cookies?: Record<string, string> }[] = [{}, { bearer: tenant }, { cookies: { ar_access: tenant } }, { cookies: { ar_platform: tenant } }];
    for (const options of attempts) {
      const response = await call("GET /platform/orgs", options);
      expect(response.status).toBe(401);
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe("UNAUTHENTICATED");
    }
  });

  it("rejects a staff session after the e-mail leaves the allow-list", async () => {
    setTenancyConfigForTests({ platformAdminEmails: [], google: { clientId: CLIENT_ID, clientSecret: "secret", issuer: ISSUER } });
    try {
      expect((await call("GET /platform/orgs", { cookies: { ar_platform: staff } })).status).toBe(401);
    } finally {
      setTenancyConfigForTests({ platformAdminEmails: ["staff@agrorende.dev"], google: { clientId: CLIENT_ID, clientSecret: "secret", issuer: ISSUER } });
    }
  });

  it("lists organisations with metadata only", async () => {
    const response = await call("GET /platform/orgs", { cookies: { ar_platform: staff } });
    expect(response.status).toBe(200);
    const { items } = (await response.json()) as { items: Record<string, unknown>[] };
    expect(items.map((item) => item.id)).toEqual(expect.arrayContaining([SEED.orgA, SEED.orgB]));
    expect(Object.keys(items[0] ?? {}).sort()).toEqual(
      ["cancelledAt", "createdAt", "expectedFieldUsers", "id", "latestUsage", "name", "pastDueAt", "plan", "purgeAfter", "signupSource", "status", "suspendedAt", "trialEndsAt"].sort(),
    );
    const filtered = await call("GET /platform/orgs", { cookies: { ar_platform: staff }, query: { status: "TRIAL" } });
    const trial = (await filtered.json()) as { items: { status: string }[] };
    expect(trial.items.every((item) => item.status === "TRIAL")).toBe(true);
  });

  it("extends a trial, changes status and plan, and audits every action with the reason", async () => {
    const trialEndsAt = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000).toISOString();
    const missingReason = await call("PATCH /platform/orgs/:id", { params: { id: SEED.orgB }, cookies: { ar_platform: staff }, body: { trialEndsAt } });
    expect(missingReason.status).toBe(422);
    const extended = await call("PATCH /platform/orgs/:id", { params: { id: SEED.orgB }, cookies: { ar_platform: staff }, body: { trialEndsAt, plan: "pilot", reason: "Pilot customer asked for more time" } });
    expect(extended.status).toBe(200);
    const detail = (await extended.json()) as { trialEndsAt: string; plan: string; audit: { action: string; actorEmail: string; reason: string }[]; admins: { id: string }[] };
    expect(detail.trialEndsAt).toBe(trialEndsAt);
    expect(detail.plan).toBe("pilot");
    expect(detail.audit.map((row) => row.action).sort()).toEqual(["org.plan.change", "org.trial.extend"]);
    expect(detail.audit.every((row) => row.actorEmail === "staff@agrorende.dev" && row.reason.length > 0)).toBe(true);
    expect(detail.admins.map((admin) => admin.id)).toEqual([SEED.orgBUser]);

    const suspended = await call("PATCH /platform/orgs/:id", { params: { id: SEED.orgB }, cookies: { ar_platform: staff }, body: { status: "SUSPENDED", reason: "Unpaid invoice" } });
    expect(((await suspended.json()) as { status: string }).status).toBe("SUSPENDED");
    const reactivated = await call("PATCH /platform/orgs/:id", { params: { id: SEED.orgB }, cookies: { ar_platform: staff }, body: { status: "ACTIVE", reason: "Paid" } });
    expect(((await reactivated.json()) as { status: string }).status).toBe("ACTIVE");
    expect(await db.raw("event_outbox").countDocuments({ organizationId: SEED.orgB, type: "sync:poke" })).toBe(1);
    expect(await db.raw("platform_audit_events").countDocuments({ organizationId: SEED.orgB, action: "org.status.change" })).toBe(2);
  });

  it("rejects cross-site mutations", async () => {
    const response = await call("PATCH /platform/orgs/:id", { params: { id: SEED.orgB }, cookies: { ar_platform: staff }, body: { plan: "x", reason: "csrf" }, origin: "https://evil.example" });
    expect(response.status).toBe(403);
  });

  it("creates an ADMIN reset link only for an ADMIN of that organisation", async () => {
    const ok = await call("POST /platform/orgs/:id/admin-reset-link", { params: { id: SEED.orgB }, cookies: { ar_platform: staff }, body: { userId: SEED.orgBUser, reason: "Owner lost access" } });
    expect(ok.status).toBe(201);
    expect(((await ok.json()) as { url: string }).url).toMatch(/\/r\//);
    const otherOrg = await call("POST /platform/orgs/:id/admin-reset-link", { params: { id: SEED.orgB }, cookies: { ar_platform: staff }, body: { userId: SEED.admin, reason: "Wrong org" } });
    expect(otherOrg.status).toBe(404);
    const notAdmin = await call("POST /platform/orgs/:id/admin-reset-link", { params: { id: SEED.orgA }, cookies: { ar_platform: staff }, body: { userId: SEED.field, reason: "Field user" } });
    expect(notAdmin.status).toBe(404);
    expect(await db.raw("platform_audit_events").countDocuments({ organizationId: SEED.orgB, action: "org.adminResetLink" })).toBe(1);
  });

  it("returns NOT_FOUND for an unknown organisation", async () => {
    const response = await call("GET /platform/orgs/:id", { params: { id: "018fd000-0000-7000-8000-0000000fffff" }, cookies: { ar_platform: staff } });
    expect(response.status).toBe(404);
  });
});
