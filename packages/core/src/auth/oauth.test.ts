import { createHash, randomBytes } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { decryptAppleRefreshToken, revokeAppleRefreshToken } from "./apple";
import { platformApi } from "./api/index";
import { setAuthConfigForTests } from "./config";
import { errorRedirect, readOAuthState } from "./oauth";
import { setOAuthConfigForTests } from "./oidc";
import { memoryRateLimiter, setRateLimiter } from "./rateLimit";
import { mockIdToken, mockProviderLogin, type MockCallback } from "./testing/mockOidc";
import { createNamedSeededDb, SEED, type SeededDb } from "./testing/seeded";
import { signupOrganization } from "../modules/tenancy/service";
import { setTenancyConfigForTests } from "../modules/tenancy/config";

const BASE = "http://localhost:3000";
const GOOGLE_ISSUER = "http://localhost:4003/google";
const APPLE_ISSUER = "http://localhost:4003/apple";
const DEVICE = "018fd000-0000-7000-8000-00000000d0aa";

let db: SeededDb;
let seq = 0;

function unique(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}-${Date.now()}`;
}

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

function setCookies(response: Response): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const header of response.headers.getSetCookie()) {
    const [pair = ""] = header.split(";");
    const index = pair.indexOf("=");
    cookies.set(pair.slice(0, index), decodeURIComponent(pair.slice(index + 1)));
  }
  return cookies;
}

async function start(provider: "google" | "apple", query: Record<string, string>): Promise<{ authorizeUrl: string; cookie: string }> {
  const url = new URL(`/api/v1/auth/oauth/${provider}/start`, BASE);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const response = await platformApi["GET /auth/oauth/:provider/start"](new Request(url, { headers: { "x-forwarded-for": "10.9.0.1" } }), { provider });
  expect(response.status).toBe(303);
  const location = response.headers.get("location");
  if (location === null) throw new Error("no location");
  const cookie = setCookies(response).get(`ar_oauth_${provider}`);
  if (cookie === undefined) throw new Error("no state cookie");
  return { authorizeUrl: location, cookie };
}

async function callback(provider: "google" | "apple", result: MockCallback, cookie: string | null): Promise<Response> {
  const headers = new Headers({ "x-forwarded-for": "10.9.0.1" });
  if (cookie !== null) headers.set("cookie", `ar_oauth_${provider}=${encodeURIComponent(cookie)}`);
  if (provider === "google") {
    expect(result.method).toBe("GET");
    return platformApi["GET /auth/oauth/google/callback"](new Request(result.url, { headers }), {});
  }
  expect(result.method).toBe("POST");
  headers.set("content-type", "application/x-www-form-urlencoded");
  return platformApi["POST /auth/oauth/apple/callback"](new Request(new URL("/api/v1/auth/oauth/apple/callback", BASE), { method: "POST", headers, body: result.form?.toString() ?? "" }), {});
}

async function exchange(body: Record<string, unknown>): Promise<Response> {
  return platformApi["POST /auth/oauth/exchange"](
    new Request(new URL("/api/v1/auth/oauth/exchange", BASE), { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.9.0.1" }, body: JSON.stringify(body) }),
    {},
  );
}

beforeAll(async () => {
  setAuthConfigForTests({ jwtSecret: "t10-oauth-test-secret-0123456789abcdef0123", redisUrl: null, appUrl: BASE });
  setTenancyConfigForTests({ trialDays: 30, termsVersion: "2026-10-08", supportWhatsApp: null, platformAdminEmails: [] });
  setOAuthConfigForTests({
    google: { issuer: GOOGLE_ISSUER, clientId: "agrorende-local", clientSecret: "agrorende-local-secret" },
    apple: {
      issuer: APPLE_ISSUER,
      servicesId: "app.agrorende.signin",
      clientId: "app.agrorende.signin",
      bundleIds: ["app.agrorende", "app.agrorende.dev", "app.agrorende.preview"],
      teamId: "",
      keyId: "",
      privateKey: "",
    },
    encryptionKey: "a".repeat(64),
    mobileSchemes: ["agrorende", "agrorende-dev", "agrorende-preview"],
  });
  db = await createNamedSeededDb("agrorende_t10_oauth");
}, 60_000);

beforeEach(() => {
  setRateLimiter(memoryRateLimiter());
});

afterAll(async () => {
  setAuthConfigForTests(null);
  setTenancyConfigForTests(null);
  setOAuthConfigForTests(null);
  await db.close();
});

describe("Google web flow", () => {
  it("signs in an existing identity and sets the session cookies", async () => {
    const { authorizeUrl, cookie } = await start("google", { intent: "login" });
    const authorize = new URL(authorizeUrl);
    expect(authorize.origin + authorize.pathname).toBe(`${GOOGLE_ISSUER}/authorize`);
    expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorize.searchParams.get("scope")).toBe("openid email profile");
    expect(authorize.searchParams.get("nonce")).not.toBeNull();

    const result = await mockProviderLogin(authorizeUrl, { sub: "mock-google-tecnico1", email: "tecnico1@agrorende.dev", name: "Técnico 1" });
    const response = await callback("google", result, cookie);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${BASE}/office-role-required`);
    const cookies = setCookies(response);
    expect(cookies.get("ar_access")?.length ?? 0).toBeGreaterThan(20);
    expect(cookies.get("ar_refresh")?.length ?? 0).toBeGreaterThan(20);
    expect(cookies.get("ar_oauth_google")).toBe("");
  });

  it("rejects a callback without the state cookie as OAUTH_STATE_EXPIRED", async () => {
    const { authorizeUrl } = await start("google", { intent: "login" });
    const result = await mockProviderLogin(authorizeUrl, { sub: "mock-google-tecnico1", email: "tecnico1@agrorende.dev" });
    const response = await callback("google", result, null);
    expect(response.headers.get("location")).toBe(`${BASE}/login?error=OAUTH_STATE_EXPIRED`);
    expect(setCookies(response).has("ar_access")).toBe(false);
  });

  it("rejects a tampered or missing state as OAUTH_STATE_EXPIRED", async () => {
    const response = await platformApi["GET /auth/oauth/google/callback"](new Request(`${BASE}/api/v1/auth/oauth/google/callback?code=abc&state=forged`), {});
    expect(response.headers.get("location")).toBe(`${BASE}/login?error=OAUTH_STATE_EXPIRED`);
  });

  it("maps access_denied to OAUTH_CANCELLED", async () => {
    const { authorizeUrl, cookie } = await start("google", { intent: "login" });
    const state = new URL(authorizeUrl).searchParams.get("state") ?? "";
    const url = `${BASE}/api/v1/auth/oauth/google/callback?error=access_denied&state=${encodeURIComponent(state)}`;
    const response = await platformApi["GET /auth/oauth/google/callback"](new Request(url, { headers: { cookie: `ar_oauth_google=${encodeURIComponent(cookie)}` } }), {});
    expect(response.headers.get("location")).toBe(`${BASE}/login?error=OAUTH_CANCELLED`);
  });

  it("rejects an unknown Google account as ACCOUNT_NOT_INVITED", async () => {
    const { authorizeUrl, cookie } = await start("google", { intent: "login" });
    const result = await mockProviderLogin(authorizeUrl, { sub: unique("stranger"), email: `${unique("stranger")}@example.com` });
    const response = await callback("google", result, cookie);
    expect(response.headers.get("location")).toBe(`${BASE}/login?error=ACCOUNT_NOT_INVITED`);
  });

  it("rejects an unverified Google email", async () => {
    const { authorizeUrl, cookie } = await start("google", { intent: "login" });
    const result = await mockProviderLogin(authorizeUrl, { sub: unique("unverified"), email: "tecnico1@agrorende.dev", emailVerified: false });
    const response = await callback("google", result, cookie);
    expect(response.headers.get("location")).toBe(`${BASE}/login?error=OAUTH_PROVIDER_ERROR`);
  });

  it("refuses an invite that belongs to another organisation's account", async () => {
    const { authorizeUrl, cookie } = await start("google", { intent: "invite", inviteCode: SEED.inviteCode });
    const orgBUser = await db.raw("users").findOne({ _id: SEED.orgBUser });
    const result = await mockProviderLogin(authorizeUrl, { sub: unique("orgb"), email: String(orgBUser?.email) });
    const response = await callback("google", result, cookie);
    expect(response.headers.get("location")).toBe(`${BASE}/login?error=ACCOUNT_IN_OTHER_ORG`);
  });

  it("redeems an invite with a new Google identity bound to the invited user", async () => {
    const { authorizeUrl, cookie } = await start("google", { intent: "invite", inviteCode: SEED.inviteCode });
    const subject = unique("invitee");
    const result = await mockProviderLogin(authorizeUrl, { sub: subject, email: "convite@agrorende.dev", name: "Convidado" });
    const response = await callback("google", result, cookie);
    expect(response.headers.get("location")).toBe(`${BASE}/office-role-required`);
    expect(setCookies(response).has("ar_access")).toBe(true);
    const identity = await db.raw("user_identities").findOne({ provider: "GOOGLE", subject });
    expect(identity?.userId).toBe(SEED.invitee);
    const user = await db.raw("users").findOne({ _id: SEED.invitee });
    expect(user?.joinedAt).toBeInstanceOf(Date);

    // The same identity signs in again without an invite.
    const again = await start("google", { intent: "login" });
    const second = await mockProviderLogin(again.authorizeUrl, { sub: subject, email: "convite@agrorende.dev" });
    expect((await callback("google", second, again.cookie)).headers.get("location")).toBe(`${BASE}/office-role-required`);
  });

  it("issues a sign-up ticket for intent=signup and creates the organisation", async () => {
    const { authorizeUrl, cookie } = await start("google", { intent: "signup" });
    const subject = unique("owner");
    const email = `${subject}@example.com`;
    const result = await mockProviderLogin(authorizeUrl, { sub: subject, email, name: "Dona da Locadora" });
    const response = await callback("google", result, cookie);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/signup/company");
    const ticket = location.searchParams.get("ticket");
    expect(ticket).not.toBeNull();
    expect(setCookies(response).has("ar_access")).toBe(false);

    const created = await signupOrganization(
      { ticket: ticket ?? "", name: "Locadora OAuth", officePhone: "+5516999990000", taxId: undefined, timezone: "America/Sao_Paulo", locale: "pt-BR", expectedFieldUsers: "1-5", acceptTerms: true },
      { ip: "10.9.0.2" },
    );
    expect(created.user.email).toBe(email);
    expect(created.user.role).toBe("ADMIN");

    // The new owner now signs in through the login intent.
    const again = await start("google", { intent: "login" });
    const second = await mockProviderLogin(again.authorizeUrl, { sub: subject, email });
    expect((await callback("google", second, again.cookie)).headers.get("location")).toBe(`${BASE}/`);
  });

  it("forwards the invite role and masked e-mail for INVITE_EMAIL_MISMATCH on the web only", () => {
    const details = { role: "MANAGER", emailHint: "o***@example.com", internal: "dropped" };
    expect(errorRedirect({ client: "web", appRedirectUri: null, intent: "invite" }, "INVITE_EMAIL_MISMATCH", details)).toBe(
      `${BASE}/login?error=INVITE_EMAIL_MISMATCH&role=MANAGER&emailHint=o***%40example.com`,
    );
    expect(errorRedirect({ client: "app", appRedirectUri: "agrorende://oauth", intent: "invite" }, "INVITE_EMAIL_MISMATCH", details)).toBe(
      "agrorende://oauth?error=INVITE_EMAIL_MISMATCH",
    );
  });

  it("redirects a web start without the invite code back to /login", async () => {
    const response = await platformApi["GET /auth/oauth/:provider/start"](new Request(`${BASE}/api/v1/auth/oauth/google/start?intent=invite`), { provider: "google" });
    expect(response.headers.get("location")).toBe(`${BASE}/login?error=VALIDATION_FAILED`);
  });

  it("treats a state older than ten minutes as OAUTH_STATE_EXPIRED", async () => {
    const { authorizeUrl, cookie } = await start("google", { intent: "signup" });
    const state = new URL(authorizeUrl).searchParams.get("state");
    await expect(readOAuthState("google", state, cookie, new Date(Date.now() + 11 * 60_000))).rejects.toMatchObject({ code: "OAUTH_STATE_EXPIRED" });
    await expect(readOAuthState("google", state, cookie)).resolves.toMatchObject({ intent: "signup", provider: "google" });
  });
});

describe("Google app flow", () => {
  it("redirects to the app with a one-time code bound to the PKCE challenge", async () => {
    const { verifier, challenge } = pkcePair();
    const { authorizeUrl, cookie } = await start("google", { intent: "signin", redirect: "agrorende-dev://oauth", challenge, platform: "ANDROID" });
    const result = await mockProviderLogin(authorizeUrl, { sub: "mock-google-tecnico1", email: "tecnico1@agrorende.dev" });
    const response = await callback("google", result, cookie);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.protocol).toBe("agrorende-dev:");
    const code = location.searchParams.get("code") ?? "";
    expect(code.length).toBeGreaterThan(16);
    expect(setCookies(response).has("ar_access")).toBe(false);

    const wrong = await exchange({ code, verifier: pkcePair().verifier, deviceId: DEVICE, platform: "ANDROID" });
    expect(wrong.status).toBe(400);
    expect(((await wrong.json()) as { error: { code: string } }).error.code).toBe("OAUTH_STATE_EXPIRED");

    const ok = await exchange({ code, verifier, deviceId: DEVICE, platform: "ANDROID" });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { user: { id: string }; accessToken: string; refreshToken: string };
    expect(body.user.id).toBe(SEED.field);
    expect(body.accessToken.length).toBeGreaterThan(20);
    expect(body.refreshToken.length).toBeGreaterThan(20);

    const reused = await exchange({ code, verifier, deviceId: DEVICE, platform: "ANDROID" });
    expect(reused.status).toBe(400);
    expect(((await reused.json()) as { error: { code: string } }).error.code).toBe("OAUTH_STATE_EXPIRED");
  });

  it("signs up from the app and redeems the T20 sign-up login code through /auth/oauth/exchange", async () => {
    const { verifier, challenge } = pkcePair();
    const { authorizeUrl, cookie } = await start("google", { intent: "signup", redirect: "agrorende://oauth", challenge, platform: "IOS" });
    const subject = unique("app-owner");
    const result = await mockProviderLogin(authorizeUrl, { sub: subject, email: `${subject}@example.com`, name: "Dono" });
    const location = new URL((await callback("google", result, cookie)).headers.get("location") ?? "");
    expect(location.pathname).toBe("/signup/company");
    const created = await signupOrganization(
      { ticket: location.searchParams.get("ticket") ?? "", name: "Locadora App", officePhone: "+5516999990000", taxId: undefined, timezone: "America/Sao_Paulo", locale: "pt-BR", expectedFieldUsers: "1-5", acceptTerms: true },
      { ip: "10.9.0.4" },
    );
    const code = new URL(created.appRedirect ?? "").searchParams.get("code") ?? "";
    const ok = await exchange({ code, verifier, deviceId: DEVICE, platform: "IOS" });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { user: { id: string } }).user.id).toBe(created.user._id);
    expect((await exchange({ code, verifier, deviceId: DEVICE, platform: "IOS" })).status).toBe(400);
  });

  it("rejects a redirect outside OAUTH_MOBILE_SCHEMES with a JSON error", async () => {
    const { challenge } = pkcePair();
    const response = await platformApi["GET /auth/oauth/:provider/start"](
      new Request(`${BASE}/api/v1/auth/oauth/google/start?redirect=${encodeURIComponent("https://evil.example/cb")}&challenge=${challenge}`),
      { provider: "google" },
    );
    expect(response.status).toBe(422);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("VALIDATION_FAILED");
  });

  it("returns app errors to the app redirect", async () => {
    const { challenge } = pkcePair();
    const { authorizeUrl, cookie } = await start("google", { intent: "signin", redirect: "agrorende://oauth", challenge });
    const result = await mockProviderLogin(authorizeUrl, { sub: unique("app-stranger"), email: `${unique("app-stranger")}@example.com` });
    const response = await callback("google", result, cookie);
    expect(response.headers.get("location")).toBe("agrorende://oauth?error=ACCOUNT_NOT_INVITED");
  });
});

describe("Apple", () => {
  it("completes the form_post callback, stores the encrypted refresh token and revokes it", async () => {
    const { authorizeUrl, cookie } = await start("apple", { intent: "invite", inviteCode: "UNKNOWNCODE" });
    expect(new URL(authorizeUrl).searchParams.get("response_mode")).toBe("form_post");
    const bad = await mockProviderLogin(authorizeUrl, { sub: unique("apple"), email: "nobody@privaterelay.appleid.com", emailVerifiedAsString: true });
    expect((await callback("apple", bad, cookie)).headers.get("location")).toBe(`${BASE}/login?error=NOT_FOUND`);

    // Link an Apple identity to the seeded manager through the verified-email match.
    const manager = await db.raw("users").findOne({ _id: SEED.manager });
    const subject = unique("apple-manager");
    const login = await start("apple", { intent: "login" });
    const result = await mockProviderLogin(login.authorizeUrl, { sub: subject, email: String(manager?.email), emailVerifiedAsString: true });
    const response = await callback("apple", result, null);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${BASE}/`);
    expect(setCookies(response).has("ar_access")).toBe(true);

    const identity = await db.raw("user_identities").findOne({ provider: "APPLE", subject });
    expect(identity?.userId).toBe(SEED.manager);
    const enc = identity?.providerRefreshTokenEnc;
    expect(typeof enc).toBe("string");
    expect(decryptAppleRefreshToken(String(enc)).clientId).toBe("app.agrorende.signin");

    await revokeAppleRefreshToken({ orgId: SEED.orgA, identityId: String(identity?._id) });
    expect(await db.raw("user_identities").findOne({ _id: identity?._id })).toBeNull();
    // Idempotent once the identity is gone.
    await revokeAppleRefreshToken({ orgId: SEED.orgA, identityId: String(identity?._id) });
  });

  it("signs in natively with an identity token for a bundle id", async () => {
    const rawNonce = randomBytes(16).toString("hex");
    const manager = await db.raw("users").findOne({ _id: SEED.manager });
    const subject = unique("apple-native");
    const { idToken, spareCode } = await mockIdToken(APPLE_ISSUER, {
      clientId: "app.agrorende.dev",
      sub: subject,
      email: String(manager?.email),
      emailVerifiedAsString: true,
      nonce: createHash("sha256").update(rawNonce).digest("hex"),
    });
    const call = (nonce: string) =>
      platformApi["POST /auth/apple"](
        new Request(`${BASE}/api/v1/auth/apple`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": "10.9.0.3" },
          body: JSON.stringify({ identityToken: idToken, authorizationCode: spareCode, rawNonce: nonce, fullName: { givenName: "Gerente", familyName: null }, deviceId: DEVICE, platform: "IOS", intent: "signin" }),
        }),
        {},
      );
    const wrongNonce = await call(randomBytes(16).toString("hex"));
    expect(wrongNonce.status).toBe(400);
    expect(((await wrongNonce.json()) as { error: { code: string } }).error.code).toBe("OAUTH_STATE_EXPIRED");
    const response = await call(rawNonce);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { user: { id: string }; accessToken: string };
    expect(body.user.id).toBe(SEED.manager);
    const identity = await db.raw("user_identities").findOne({ provider: "APPLE", subject });
    expect(identity?.userId).toBe(SEED.manager);
  });
});
