/**
 * Test helpers for the navikt `mock-oauth2-server` used as the local Google and Apple issuers
 * (ARCHITECTURE §17: `http://localhost:4003/{google,apple}`). The mock runs with
 * `interactiveLogin: true`, so a sign-in is a form POST to the authorize URL with `username`
 * (the subject) and `claims` (a JSON object merged into the ID token).
 */

export interface MockIdentity {
  /** Subject (`sub`) of the ID token. */
  readonly sub: string;
  readonly email?: string | null;
  readonly name?: string | null;
  /** Defaults to `true`. Apple-style string claims are produced with `emailVerifiedAsString`. */
  readonly emailVerified?: boolean;
  readonly emailVerifiedAsString?: boolean;
  /** Extra claims, for example `{ is_private_email: "true" }`. */
  readonly claims?: Readonly<Record<string, unknown>>;
}

export interface MockCallback {
  /** Callback URL. For `GET` it already carries `code` and `state` in the query. */
  readonly url: string;
  /** `GET` for query responses (Google), `POST` for `response_mode=form_post` (Apple). */
  readonly method: "GET" | "POST";
  /** Form fields to POST when `method` is `POST`; `null` otherwise. */
  readonly form: URLSearchParams | null;
  readonly code: string;
  readonly state: string | null;
}

function decodeHtml(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function mockClaims(identity: MockIdentity): Record<string, unknown> {
  const verified = identity.emailVerified ?? true;
  return {
    ...(identity.email === undefined || identity.email === null ? {} : { email: identity.email }),
    ...(identity.name === undefined || identity.name === null ? {} : { name: identity.name }),
    email_verified: identity.emailVerifiedAsString === true ? String(verified) : verified,
    ...identity.claims,
  };
}

/**
 * Signs in at the mock's interactive login page for `authorizeUrl` (the `Location` returned by
 * `GET /auth/oauth/:provider/start`) and returns where the provider sends the browser next.
 */
export async function mockProviderLogin(authorizeUrl: string, identity: MockIdentity): Promise<MockCallback> {
  const response = await fetch(authorizeUrl, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: identity.sub, claims: JSON.stringify(mockClaims(identity)) }).toString(),
  });
  const location = response.headers.get("location");
  if (response.status >= 300 && response.status < 400 && location !== null) {
    const url = new URL(location);
    const code = url.searchParams.get("code");
    if (code === null) throw new Error(`mock login: redirect without code (${url.searchParams.get("error") ?? "unknown"})`);
    return { url: url.toString(), method: "GET", form: null, code, state: url.searchParams.get("state") };
  }
  const html = await response.text();
  const action = /<form[^>]*action="([^"]+)"/i.exec(html)?.[1];
  if (response.status !== 200 || action === undefined) throw new Error(`mock login failed with HTTP ${response.status}`);
  const form = new URLSearchParams();
  for (const match of html.matchAll(/<input[^>]*name="([^"]+)"[^>]*value="([^"]*)"/gi)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) form.set(decodeHtml(name), decodeHtml(value));
  }
  const code = form.get("code");
  if (code === null) throw new Error("mock login: form_post without code");
  return { url: decodeHtml(action), method: "POST", form, code, state: form.get("state") };
}

/**
 * Obtains a real ID token (and refresh token) from the mock without a browser, for native Apple
 * tests: runs the interactive login for `clientId` and exchanges the code at the token endpoint.
 * Also returns a second, unused authorization code for the server-side exchange.
 */
export async function mockIdToken(
  issuer: string,
  input: MockIdentity & { readonly clientId: string; readonly nonce?: string; readonly redirectUri?: string; readonly scope?: string },
): Promise<{ idToken: string; refreshToken: string | null; spareCode: string }> {
  const authorize = (): string => {
    const url = new URL(`${issuer.replace(/\/$/, "")}/authorize`);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", input.clientId);
    url.searchParams.set("redirect_uri", input.redirectUri ?? "http://localhost:3000/native-callback");
    url.searchParams.set("scope", input.scope ?? "openid email name");
    url.searchParams.set("state", "native");
    if (input.nonce !== undefined) url.searchParams.set("nonce", input.nonce);
    return url.toString();
  };
  const first = await mockProviderLogin(authorize(), input);
  const token = await fetch(`${issuer.replace(/\/$/, "")}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: first.code,
      client_id: input.clientId,
      redirect_uri: input.redirectUri ?? "http://localhost:3000/native-callback",
    }).toString(),
  });
  if (!token.ok) throw new Error(`mock token exchange failed with HTTP ${token.status}`);
  const body = (await token.json()) as { id_token?: string; refresh_token?: string };
  if (body.id_token === undefined) throw new Error("mock token exchange: no id_token");
  const spare = await mockProviderLogin(authorize(), input);
  return { idToken: body.id_token, refreshToken: body.refresh_token ?? null, spareCode: spare.code };
}
