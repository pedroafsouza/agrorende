import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { Platform } from "@agrorende/contracts/enums";
import { AppError, type ErrorCode } from "@agrorende/contracts/errors";
import { collections, getDb } from "@agrorende/db";
import type { AuthLink, Organization, User, UserIdentity } from "@agrorende/db";
import { CodeChallengeMethod, generateCodeVerifier, OAuth2Client } from "arctic";
import { decodeJwt, EncryptJWT, jwtDecrypt, jwtVerify, SignJWT, type JWTPayload } from "jose";
import { z } from "zod";

import { redeemSignupLoginCode } from "../modules/tenancy/service.js";
import { issueSignupTicket } from "../modules/tenancy/signupTicket.js";
import { createNotification, officeRecipients } from "../notify/index.js";
import { txDb } from "../sync/touch.js";
import { withSyncTx } from "../sync/withSyncTx.js";
import { encryptAppleRefreshToken, encryptionConfigured, exchangeAppleCode, isAppleProduction } from "./apple.js";
import { authConfig } from "./config.js";
import { claimBoolean, claimString, discover, oauthConfig, verifyIdToken } from "./oidc.js";
import { sha256Hex } from "./password.js";
import { enforceRateLimit, type RateLimitRule } from "./rateLimit.js";
import { userCtx, type AuthResult } from "./service.js";
import { isDisabled, issueSession, type SessionMeta } from "./tokens.js";

/**
 * Google and Apple sign-in (ARCHITECTURE §2 ADR-21, §8, §11; PRD PLT-01, PLT-19, PLT-20, TEN-01).
 * Browser flow: server-side OIDC with an encrypted state (state, nonce, PKCE verifier and the
 * caller's intent) bound to a short-lived cookie, ID-token verification against the provider
 * JWKS, identity resolution, then web cookies, a mobile one-time login code or a sign-up ticket.
 */

export type OAuthProviderId = "google" | "apple";
export type OAuthIntent = "login" | "signup" | "invite";
export type OAuthClientKind = "web" | "app";
/** Codes used in error redirects; `OAUTH_CANCELLED` is a client-only code (ERRORS EC-PLT-41). */
export type OAuthRedirectCode = ErrorCode | "OAUTH_CANCELLED";

export const OAUTH_STATE_TTL_S = 10 * 60;
export const OAUTH_LOGIN_CODE_TTL_S = 60;
export const OAUTH_COOKIE_PATH = "/api/v1/auth/oauth";
export const OAUTH_START_LIMIT: RateLimitRule = { name: "oauth-start-ip", limit: 30, windowMs: 60_000 };
const LOGIN_CODE_SINGLE_USE: RateLimitRule = { name: "oauth-login-code", limit: 1, windowMs: 10 * 60_000 };
const STATE_AUDIENCE = "oauth-state";
const LOGIN_CODE_AUDIENCE = "oauth-login";
const CHALLENGE = /^[A-Za-z0-9_-]{43,128}$/;

export function oauthCookieName(provider: OAuthProviderId): string {
  return `ar_oauth_${provider}`;
}

export function callbackUrl(provider: OAuthProviderId): string {
  return `${authConfig().appUrl.replace(/\/$/, "")}/api/v1/auth/oauth/${provider}/callback`;
}

export function absoluteAppUrl(pathname: string): string {
  return `${authConfig().appUrl.replace(/\/$/, "")}${pathname}`;
}

function jwtSecret(): Uint8Array {
  const value = authConfig().jwtSecret;
  if (value.length === 0) throw new AppError("INTERNAL", { details: { reason: "jwt_secret_missing" } });
  return new TextEncoder().encode(value);
}

function stateKey(): Uint8Array {
  return createHash("sha256").update(`oauth-state:${authConfig().jwtSecret}`).digest();
}

function randomValue(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

// ---------------------------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------------------------

export interface OAuthStartInput {
  readonly provider: OAuthProviderId;
  readonly intent: OAuthIntent;
  readonly inviteCode: string | null;
  readonly client: OAuthClientKind;
  readonly appRedirectUri: string | null;
  readonly codeChallenge: string | null;
  /** Web only: relative path to land on after sign-in. */
  readonly next: string | null;
  readonly loginHint: string | null;
}

export interface OAuthState {
  readonly provider: OAuthProviderId;
  readonly binding: string;
  readonly nonce: string;
  readonly verifier: string;
  readonly pkce: boolean;
  readonly intent: OAuthIntent;
  readonly inviteCode: string | null;
  readonly client: OAuthClientKind;
  readonly appRedirectUri: string | null;
  readonly codeChallenge: string | null;
  readonly next: string | null;
}

const StateSchema = z.object({
  p: z.enum(["google", "apple"]),
  b: z.string().min(16),
  n: z.string().min(16),
  v: z.string().min(43),
  k: z.boolean(),
  i: z.enum(["login", "signup", "invite"]),
  c: z.string().nullable(),
  cl: z.enum(["web", "app"]),
  r: z.string().nullable(),
  ch: z.string().nullable(),
  nx: z.string().nullable(),
});

/** Accepts a mobile redirect only when its scheme is in `OAUTH_MOBILE_SCHEMES`. */
export function assertAppRedirect(uri: string | null, challenge: string | null): { appRedirectUri: string; codeChallenge: string } {
  let scheme: string | null = null;
  try {
    if (uri !== null) scheme = new URL(uri).protocol.replace(/:$/, "").toLowerCase();
  } catch {
    scheme = null;
  }
  if (uri === null || scheme === null || !oauthConfig().mobileSchemes.map((item) => item.toLowerCase()).includes(scheme)) {
    throw new AppError("VALIDATION_FAILED", { fieldErrors: [{ path: "appRedirectUri", code: "not_allowed" }] });
  }
  if (challenge === null || !CHALLENGE.test(challenge)) {
    throw new AppError("VALIDATION_FAILED", { fieldErrors: [{ path: "codeChallenge", code: "invalid" }] });
  }
  return { appRedirectUri: uri, codeChallenge: challenge };
}

export function safeNext(value: string | null): string | null {
  if (value === null || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  return value.slice(0, 500);
}

function providerClientId(provider: OAuthProviderId): string {
  const config = oauthConfig();
  const clientId = provider === "google" ? config.google.clientId : config.apple.servicesId;
  if (clientId.length === 0) throw new AppError("OAUTH_PROVIDER_ERROR", { details: { reason: "not_configured" } });
  return clientId;
}

function providerIssuer(provider: OAuthProviderId): string {
  const config = oauthConfig();
  return provider === "google" ? config.google.issuer : config.apple.issuer;
}

/** Builds the provider authorize URL and the encrypted state (also the cookie binding value). */
export async function startOAuth(input: OAuthStartInput, now: Date = new Date()): Promise<{ url: string; binding: string }> {
  const clientId = providerClientId(input.provider);
  const config = oauthConfig();
  const discovery = await discover(providerIssuer(input.provider));
  const app = input.client === "app" ? assertAppRedirect(input.appRedirectUri, input.codeChallenge) : null;
  if (input.intent === "invite" && (input.inviteCode === null || input.inviteCode.trim().length === 0)) {
    throw new AppError("VALIDATION_FAILED", { fieldErrors: [{ path: "inviteCode", code: "required" }] });
  }
  const pkce = input.provider === "google" || !isAppleProduction(config.apple);
  const binding = randomValue();
  const nonce = randomValue();
  const verifier = generateCodeVerifier();
  const iat = Math.floor(now.getTime() / 1000);
  const state = await new EncryptJWT({
    p: input.provider,
    b: binding,
    n: nonce,
    v: verifier,
    k: pkce,
    i: input.intent,
    c: input.inviteCode?.trim().toUpperCase() ?? null,
    cl: input.client,
    r: app?.appRedirectUri ?? null,
    ch: app?.codeChallenge ?? null,
    nx: input.client === "web" ? safeNext(input.next) : null,
  })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setAudience(STATE_AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + OAUTH_STATE_TTL_S)
    .encrypt(stateKey());
  let url: URL;
  if (input.provider === "google") {
    const client = new OAuth2Client(clientId, config.google.clientSecret.length > 0 ? config.google.clientSecret : null, callbackUrl("google"));
    url = client.createAuthorizationURLWithPKCE(discovery.authorization_endpoint, state, CodeChallengeMethod.S256, verifier, ["openid", "email", "profile"]);
    url.searchParams.set("prompt", "select_account");
    if (input.loginHint !== null && input.loginHint.length > 0) url.searchParams.set("login_hint", input.loginHint);
  } else {
    const client = new OAuth2Client(clientId, null, callbackUrl("apple"));
    // Apple production takes `name email`; the local OIDC mock only issues ID tokens for `openid`.
    const scopes = isAppleProduction(config.apple) ? ["name", "email"] : ["openid", "name", "email"];
    url = pkce
      ? client.createAuthorizationURLWithPKCE(discovery.authorization_endpoint, state, CodeChallengeMethod.S256, verifier, scopes)
      : client.createAuthorizationURL(discovery.authorization_endpoint, state, scopes);
    url.searchParams.set("response_mode", "form_post");
  }
  url.searchParams.set("nonce", nonce);
  return { url: url.toString(), binding };
}

/**
 * Decrypts and checks the state. The cookie binding is required for Google (same-site GET); for
 * Apple's cross-site `form_post` the browser may withhold the Lax cookie, so it is checked when present.
 */
export async function readOAuthState(provider: OAuthProviderId, stateToken: string | null, cookie: string | null | undefined, now: Date = new Date()): Promise<OAuthState> {
  if (stateToken === null || stateToken.length === 0) throw new AppError("OAUTH_STATE_EXPIRED", { details: { reason: "missing_state" } });
  let claims: z.infer<typeof StateSchema>;
  try {
    const { payload } = await jwtDecrypt(stateToken, stateKey(), { audience: STATE_AUDIENCE, currentDate: now });
    claims = StateSchema.parse(payload);
  } catch {
    throw new AppError("OAUTH_STATE_EXPIRED", { details: { reason: "state_expired" } });
  }
  if (claims.p !== provider) throw new AppError("OAUTH_STATE_EXPIRED", { details: { reason: "provider_mismatch" } });
  const hasCookie = cookie !== null && cookie !== undefined && cookie.length > 0;
  if ((provider === "google" && !hasCookie) || (hasCookie && cookie !== claims.b)) {
    throw new AppError("OAUTH_STATE_EXPIRED", { details: { reason: "state_cookie_mismatch" } });
  }
  return {
    provider: claims.p,
    binding: claims.b,
    nonce: claims.n,
    verifier: claims.v,
    pkce: claims.k,
    intent: claims.i,
    inviteCode: claims.c,
    client: claims.cl,
    appRedirectUri: claims.r,
    codeChallenge: claims.ch,
    next: claims.nx,
  };
}

/** Peeks at the state without failing, so error redirects can go back to the right client. */
export async function peekOAuthState(stateToken: string | null, now: Date = new Date()): Promise<OAuthState | null> {
  if (stateToken === null) return null;
  try {
    const { payload } = await jwtDecrypt(stateToken, stateKey(), { audience: STATE_AUDIENCE, currentDate: now, clockTolerance: 24 * 60 * 60 });
    const claims = StateSchema.parse(payload);
    return {
      provider: claims.p,
      binding: claims.b,
      nonce: claims.n,
      verifier: claims.v,
      pkce: claims.k,
      intent: claims.i,
      inviteCode: claims.c,
      client: claims.cl,
      appRedirectUri: claims.r,
      codeChallenge: claims.ch,
      next: claims.nx,
    };
  } catch {
    return null;
  }
}

/** Where an error goes: the app deep link, the sign-up start page or the web login page. */
export function errorRedirect(state: Pick<OAuthState, "client" | "appRedirectUri" | "intent"> | null, code: OAuthRedirectCode): string {
  if (state !== null && state.client === "app" && state.appRedirectUri !== null) {
    const separator = state.appRedirectUri.includes("?") ? "&" : "?";
    return `${state.appRedirectUri}${separator}error=${encodeURIComponent(code)}`;
  }
  const page = state?.intent === "signup" ? "/signup" : "/login";
  return absoluteAppUrl(`${page}?error=${encodeURIComponent(code)}`);
}

// ---------------------------------------------------------------------------------------------
// Callback
// ---------------------------------------------------------------------------------------------

export interface ProviderIdentity {
  readonly provider: UserIdentity["provider"];
  readonly subject: string;
  readonly email: string | null;
  readonly emailVerified: boolean;
  readonly isPrivateRelay: boolean;
  readonly name: string | null;
  /** Apple only: encrypted refresh token to keep for account-deletion revocation. */
  readonly refreshTokenEnc: string | null;
}

export interface OAuthCallbackParams {
  readonly code: string | null;
  readonly error: string | null;
  /** Apple `form_post` `user` JSON (first sign-in only): `{ name: { firstName, lastName } }`. */
  readonly user: string | null;
}

export type OAuthOutcome =
  | { readonly kind: "web"; readonly result: AuthResult; readonly location: string }
  | { readonly kind: "redirect"; readonly location: string };

const CANCEL_ERRORS = new Set(["access_denied", "user_cancelled_authorize", "user_canceled_authorize", "user_cancelled", "consent_required"]);

export function isCancelError(value: string): boolean {
  return CANCEL_ERRORS.has(value);
}

/** Marker thrown when the provider reports that the user cancelled. */
export class OAuthCancelledError extends Error {
  constructor() {
    super("OAUTH_CANCELLED");
    this.name = "OAuthCancelledError";
  }
}

function appleName(user: string | null): string | null {
  if (user === null) return null;
  try {
    const parsed = z
      .object({ name: z.object({ firstName: z.string().optional(), lastName: z.string().optional() }).optional() })
      .parse(JSON.parse(user));
    const name = [parsed.name?.firstName, parsed.name?.lastName].filter((part) => part !== undefined && part.trim().length > 0).join(" ");
    return name.length > 0 ? name.slice(0, 120) : null;
  } catch {
    return null;
  }
}

async function exchangeGoogle(code: string, state: OAuthState): Promise<{ idToken: string }> {
  const config = oauthConfig();
  const discovery = await discover(config.google.issuer);
  const client = new OAuth2Client(config.google.clientId, config.google.clientSecret.length > 0 ? config.google.clientSecret : null, callbackUrl("google"));
  try {
    const tokens = await client.validateAuthorizationCode(discovery.token_endpoint, code, state.verifier);
    return { idToken: tokens.idToken() };
  } catch {
    throw new AppError("OAUTH_PROVIDER_ERROR", { details: { reason: "token_exchange_failed" } });
  }
}

function identityFromClaims(provider: UserIdentity["provider"], claims: JWTPayload, name: string | null, refreshTokenEnc: string | null): ProviderIdentity {
  const subject = claimString(claims.sub);
  if (subject === null) throw new AppError("OAUTH_PROVIDER_ERROR", { details: { reason: "id_token_invalid" } });
  const email = claimString(claims.email)?.toLowerCase() ?? null;
  const emailVerified = claimBoolean(claims.email_verified);
  if (provider === "GOOGLE" && (email === null || !emailVerified)) {
    throw new AppError("OAUTH_PROVIDER_ERROR", { details: { reason: "email_unverified" } });
  }
  return {
    provider,
    subject,
    email,
    emailVerified,
    isPrivateRelay: claimBoolean(claims.is_private_email) || (email?.endsWith("@privaterelay.appleid.com") ?? false),
    name: name ?? claimString(claims.name)?.slice(0, 120) ?? null,
    refreshTokenEnc,
  };
}

/** Exchanges the code, verifies the ID token and resolves the identity for a decoded state. */
export async function completeOAuth(state: OAuthState, params: OAuthCallbackParams, meta: SessionMeta = {}): Promise<OAuthOutcome> {
  const now = meta.now ?? new Date();
  if (params.error !== null) {
    if (CANCEL_ERRORS.has(params.error)) throw new OAuthCancelledError();
    throw new AppError("OAUTH_PROVIDER_ERROR", { details: { reason: "provider_error" } });
  }
  if (params.code === null || params.code.length === 0) throw new AppError("OAUTH_PROVIDER_ERROR", { details: { reason: "missing_code" } });
  const config = oauthConfig();
  let identity: ProviderIdentity;
  if (state.provider === "google") {
    const { idToken } = await exchangeGoogle(params.code, state);
    const claims = await verifyIdToken(config.google.issuer, idToken, config.google.clientId, now);
    if (claims.nonce !== state.nonce) throw new AppError("OAUTH_STATE_EXPIRED", { details: { reason: "nonce_mismatch" } });
    identity = identityFromClaims("GOOGLE", claims, null, null);
  } else {
    const clientId = config.apple.servicesId;
    const tokens = await exchangeAppleCode({ code: params.code, clientId, redirectUri: callbackUrl("apple"), verifier: state.pkce ? state.verifier : null, now });
    const claims = await verifyIdToken(config.apple.issuer, tokens.id_token, clientId, now);
    if (claims.nonce !== state.nonce) throw new AppError("OAUTH_STATE_EXPIRED", { details: { reason: "nonce_mismatch" } });
    const enc = tokens.refresh_token !== undefined && encryptionConfigured() ? encryptAppleRefreshToken({ token: tokens.refresh_token, clientId }) : null;
    identity = identityFromClaims("APPLE", claims, appleName(params.user), enc);
  }
  const resolution = await resolveIdentity(identity, { intent: state.intent, inviteCode: state.inviteCode }, now);
  if (resolution.kind === "signup") {
    const ticket = await issueSignupTicket(
      { provider: identity.provider, subject: identity.subject, email: identity.email, emailVerified: identity.emailVerified, isPrivateRelay: identity.isPrivateRelay, name: identity.name },
      state.client === "app" && state.appRedirectUri !== null && state.codeChallenge !== null
        ? { client: "app", appRedirectUri: state.appRedirectUri, codeChallenge: state.codeChallenge, now }
        : { client: "web", now },
    );
    return { kind: "redirect", location: absoluteAppUrl(`/signup/company?ticket=${encodeURIComponent(ticket.ticket)}`) };
  }
  const user = resolution.user;
  if (state.client === "app" && state.appRedirectUri !== null && state.codeChallenge !== null) {
    const code = await issueAppLoginCode({ userId: user._id, orgId: user.organizationId, codeChallenge: state.codeChallenge, now });
    const separator = state.appRedirectUri.includes("?") ? "&" : "?";
    return { kind: "redirect", location: `${state.appRedirectUri}${separator}code=${encodeURIComponent(code)}` };
  }
  const org = await loadOrg(user.organizationId);
  const session = await issueSession(user, { ...meta, now });
  const landing = state.next ?? (user.role === "FIELD" ? "/office-role-required" : "/");
  return { kind: "web", result: { user, org, session }, location: absoluteAppUrl(landing) };
}

// ---------------------------------------------------------------------------------------------
// Identity resolution
// ---------------------------------------------------------------------------------------------

export type Resolution = { readonly kind: "user"; readonly user: User } | { readonly kind: "signup" };

async function loadOrg(organizationId: string): Promise<Organization> {
  const org = await collections.organizations(await getDb()).findOne({ _id: organizationId });
  if (org === null) throw new AppError("UNAUTHENTICATED", { details: { reason: "org_missing" } });
  return org;
}

async function findInvite(code: string): Promise<AuthLink | null> {
  return collections.authLinks(await getDb()).findOne({ codeHash: sha256Hex(code.trim().toUpperCase()), kind: "INVITE" });
}

function linkUsable(link: AuthLink, now: Date): boolean {
  return (link.redeemedAt === null || link.redeemedAt === undefined) && (link.revokedAt === null || link.revokedAt === undefined) && link.expiresAt.getTime() > now.getTime();
}

function emailHint(email: string | null): string | null {
  if (email === null) return null;
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

function newIdentity(user: Pick<User, "_id" | "organizationId">, identity: ProviderIdentity, now: Date): UserIdentity {
  return {
    _id: randomUUID(),
    organizationId: user.organizationId,
    userId: user._id,
    provider: identity.provider,
    subject: identity.subject,
    email: identity.email,
    emailVerified: identity.emailVerified,
    isPrivateRelay: identity.isPrivateRelay,
    providerRefreshTokenEnc: identity.refreshTokenEnc,
    lastUsedAt: now,
    createdAt: now,
  };
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000;
}

async function touchSignIn(user: User, identityRow: UserIdentity, identity: ProviderIdentity, now: Date): Promise<User> {
  const db = await getDb();
  await collections.userIdentities(db).updateOne(
    { _id: identityRow._id, organizationId: identityRow.organizationId },
    {
      $set: {
        lastUsedAt: now,
        emailVerified: identity.emailVerified,
        isPrivateRelay: identity.isPrivateRelay,
        ...(identity.email === null ? {} : { email: identity.email }),
        ...(identity.refreshTokenEnc === null ? {} : { providerRefreshTokenEnc: identity.refreshTokenEnc }),
      },
    },
  );
  await collections.users(db).updateOne({ _id: user._id, organizationId: user.organizationId }, { $set: { lastSeenAt: now } });
  return { ...user, lastSeenAt: now };
}

/** Binds the identity to the invited user and redeems the invite (EC-PLT-35/36/37, PLT-19, PLT-20). */
async function redeemInvite(link: AuthLink, identity: ProviderIdentity, now: Date): Promise<User> {
  if (!linkUsable(link, now)) throw new AppError("INVITE_EXPIRED");
  const db = await getDb();
  const user = await collections.users(db).findOne({ _id: link.userId, organizationId: link.organizationId, deletedAt: null });
  if (user === null) throw new AppError("NOT_FOUND", { details: { entityType: "INVITE" } });
  if (user.disabledAt !== null && user.disabledAt !== undefined) throw new AppError("ACCOUNT_DISABLED");
  const verifiedEmail = identity.emailVerified ? identity.email : null;
  if (verifiedEmail !== null) {
    const elsewhere = await collections.users(db).findOne({ email: verifiedEmail, organizationId: { $ne: link.organizationId }, deletedAt: null }, { projection: { _id: 1 } });
    if (elsewhere !== null) throw new AppError("ACCOUNT_IN_OTHER_ORG", { details: { reason: "email_in_other_org" } });
  }
  const invited = (link.email ?? user.email ?? null)?.toLowerCase() ?? null;
  const role = link.role ?? user.role;
  const matches = invited !== null && verifiedEmail === invited;
  if (!matches && role !== "FIELD") {
    throw new AppError("INVITE_EMAIL_MISMATCH", { details: { role, emailHint: emailHint(invited) } });
  }
  try {
    await withSyncTx(userCtx(user), async (tx) => {
      const scoped = txDb(tx);
      const claimed = await scoped.auth_links.updateOne({ _id: link._id, redeemedAt: null }, { $set: { redeemedAt: now, redeemedVia: identity.provider } });
      if (claimed.modifiedCount === 0) throw new AppError("INVITE_EXPIRED");
      await scoped.users.updateOne(
        { _id: user._id },
        {
          $set: {
            email: invited ?? identity.email,
            isActive: true,
            joinedAt: user.joinedAt ?? now,
            lastSeenAt: now,
            ...(link.role === null || link.role === undefined ? {} : { role: link.role }),
            ...(user.name.trim().length === 0 && identity.name !== null ? { name: identity.name } : {}),
            updatedAt: now,
            syncVersion: tx.syncVersion,
          },
        },
      );
      await scoped.user_identities.insertOne(newIdentity(user, identity, now));
      if (!matches) {
        const admins = await officeRecipients(tx, user.organizationId, ["ADMIN"]);
        await createNotification(tx, { type: "JOINED_WITH_OTHER_EMAIL", userIds: admins, entity: { entityType: "USER", entityId: user._id }, params: { name: user.name } });
      }
    });
  } catch (error) {
    if (isDuplicateKey(error)) throw new AppError("ACCOUNT_IN_OTHER_ORG", { details: { reason: "identity_in_use" } });
    throw error;
  }
  const fresh = await collections.users(db).findOne({ _id: user._id, organizationId: user.organizationId });
  if (fresh === null) throw new AppError("NOT_FOUND", { details: { entityType: "USER" } });
  return fresh;
}

/**
 * Identity resolution order: a known identity signs in its user (an invite from another company
 * is `ACCOUNT_IN_OTHER_ORG`); an invite code redeems the invite; a verified email that matches a
 * single invited user with a usable invite redeems it, or a single joined member without an
 * identity for this provider links it; a sign-up intent becomes a sign-up ticket; anything else
 * is `ACCOUNT_NOT_INVITED`.
 */
export async function resolveIdentity(identity: ProviderIdentity, context: { readonly intent: OAuthIntent; readonly inviteCode: string | null }, now: Date = new Date()): Promise<Resolution> {
  const db = await getDb();
  const existing = await collections.userIdentities(db).findOne({ provider: identity.provider, subject: identity.subject });
  if (existing !== null) {
    const user = await collections.users(db).findOne({ _id: existing.userId, organizationId: existing.organizationId, deletedAt: null });
    if (user !== null) {
      if (context.intent === "invite" && context.inviteCode !== null) {
        const link = await findInvite(context.inviteCode);
        if (link !== null && link.organizationId !== user.organizationId) throw new AppError("ACCOUNT_IN_OTHER_ORG", { details: { reason: "identity_in_use" } });
        if (link !== null && link.userId === user._id && linkUsable(link, now)) {
          await collections.authLinks(db).updateOne({ _id: link._id, redeemedAt: null }, { $set: { redeemedAt: now, redeemedVia: identity.provider } });
        }
      }
      if (isDisabled(user)) throw new AppError("ACCOUNT_DISABLED");
      return { kind: "user", user: await touchSignIn(user, existing, identity, now) };
    }
    // Orphaned identity of a deleted user: drop it so the person can be invited again.
    await collections.userIdentities(db).deleteOne({ _id: existing._id, organizationId: existing.organizationId });
  }

  if (context.intent === "invite" && context.inviteCode !== null) {
    const link = await findInvite(context.inviteCode);
    if (link === null) throw new AppError("NOT_FOUND", { details: { entityType: "INVITE" } });
    return { kind: "user", user: await redeemInvite(link, identity, now) };
  }

  const email = identity.emailVerified ? identity.email : null;
  if (email !== null) {
    const candidates = await collections.users(db).find({ email, deletedAt: null }).limit(2).toArray();
    const [user] = candidates;
    if (candidates.length === 1 && user !== undefined) {
      const pending = await collections
        .authLinks(db)
        .findOne({ userId: user._id, organizationId: user.organizationId, kind: "INVITE", redeemedAt: null, revokedAt: null, expiresAt: { $gt: now } }, { sort: { createdAt: -1 } });
      if (pending !== null && (user.joinedAt === null || user.joinedAt === undefined)) {
        return { kind: "user", user: await redeemInvite(pending, identity, now) };
      }
      if (user.joinedAt !== null && user.joinedAt !== undefined) {
        if (isDisabled(user)) throw new AppError("ACCOUNT_DISABLED");
        const sameProvider = await collections.userIdentities(db).findOne({ userId: user._id, organizationId: user.organizationId, provider: identity.provider });
        if (sameProvider === null) {
          try {
            await collections.userIdentities(db).insertOne(newIdentity(user, identity, now));
          } catch (error) {
            if (isDuplicateKey(error)) throw new AppError("ACCOUNT_IN_OTHER_ORG", { details: { reason: "identity_in_use" } });
            throw error;
          }
          await collections.users(db).updateOne({ _id: user._id, organizationId: user.organizationId }, { $set: { lastSeenAt: now } });
          return { kind: "user", user: { ...user, lastSeenAt: now } };
        }
      }
    }
  }

  if (context.intent === "signup") return { kind: "signup" };
  throw new AppError("ACCOUNT_NOT_INVITED", { details: { email: identity.email } });
}

// ---------------------------------------------------------------------------------------------
// Mobile one-time login code (60 s, single use, bound to the app PKCE challenge)
// ---------------------------------------------------------------------------------------------

const LoginCodeSchema = z.object({
  tokenUse: z.literal("oauth_login"),
  jti: z.string().min(1),
  sub: z.string().min(1),
  org: z.string().min(1),
  codeChallenge: z.string().regex(CHALLENGE),
});

export async function issueAppLoginCode(input: { readonly userId: string; readonly orgId: string; readonly codeChallenge: string; readonly now?: Date }): Promise<string> {
  const iat = Math.floor((input.now ?? new Date()).getTime() / 1000);
  return new SignJWT({ tokenUse: "oauth_login", org: input.orgId, codeChallenge: input.codeChallenge })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(LOGIN_CODE_AUDIENCE)
    .setSubject(input.userId)
    .setJti(randomUUID())
    .setIssuedAt(iat)
    .setExpirationTime(iat + OAUTH_LOGIN_CODE_TTL_S)
    .sign(jwtSecret());
}

export interface ExchangeInput {
  readonly code: string;
  readonly verifier: string;
  readonly deviceId: string;
  readonly platform?: Platform;
}

/**
 * `POST /auth/oauth/exchange`: redeems an OAuth login code or a T20 sign-up login code (change
 * request T20-001) for the app token pair. Expired, reused or wrongly verified codes are `OAUTH_STATE_EXPIRED`.
 */
export async function exchangeLoginCode(input: ExchangeInput, meta: SessionMeta = {}): Promise<AuthResult> {
  const now = meta.now ?? new Date();
  let tokenUse: unknown;
  try {
    tokenUse = decodeJwt(input.code).tokenUse;
  } catch {
    throw new AppError("OAUTH_STATE_EXPIRED", { details: { reason: "login_code_invalid" } });
  }
  if (tokenUse === "signup_login") {
    const result = await redeemSignupLoginCode(input.code, input.verifier, {
      ...(meta.ip === null || meta.ip === undefined ? {} : { ip: meta.ip }),
      userAgent: meta.userAgent ?? null,
      deviceId: input.deviceId,
      now,
    });
    return { user: result.user, org: result.organization, session: result.session };
  }
  let claims: z.infer<typeof LoginCodeSchema>;
  try {
    const { payload } = await jwtVerify(input.code, jwtSecret(), { audience: LOGIN_CODE_AUDIENCE, algorithms: ["HS256"], currentDate: now });
    claims = LoginCodeSchema.parse(payload);
  } catch {
    throw new AppError("OAUTH_STATE_EXPIRED", { details: { reason: "login_code_expired" } });
  }
  if (pkceChallenge(input.verifier) !== claims.codeChallenge) throw new AppError("OAUTH_STATE_EXPIRED", { details: { reason: "pkce_mismatch" } });
  try {
    await enforceRateLimit(`jti:${claims.jti}`, LOGIN_CODE_SINGLE_USE);
  } catch {
    throw new AppError("OAUTH_STATE_EXPIRED", { details: { reason: "login_code_used" } });
  }
  const user = await collections.users(await getDb()).findOne({ _id: claims.sub, organizationId: claims.org, deletedAt: null });
  if (user === null) throw new AppError("UNAUTHENTICATED");
  if (isDisabled(user)) throw new AppError("ACCOUNT_DISABLED");
  const org = await loadOrg(user.organizationId);
  const session = await issueSession(user, { ...meta, deviceId: input.deviceId, now });
  return { user, org, session };
}

// ---------------------------------------------------------------------------------------------
// Native Sign in with Apple (iOS)
// ---------------------------------------------------------------------------------------------

export interface NativeAppleInput {
  readonly identityToken: string;
  readonly authorizationCode: string;
  readonly rawNonce: string;
  readonly fullName: { readonly givenName?: string | null; readonly familyName?: string | null } | null;
  readonly deviceId: string;
  readonly intent: OAuthIntent;
  readonly inviteCode: string | null;
}

/**
 * `POST /auth/apple`: verifies the native identity token (audience in `APPLE_BUNDLE_IDS`, nonce =
 * SHA-256 hex of `rawNonce`), keeps the encrypted refresh token when the code exchange succeeds,
 * resolves the identity and issues the app session.
 */
export async function nativeAppleSignIn(input: NativeAppleInput, meta: SessionMeta = {}): Promise<AuthResult> {
  const now = meta.now ?? new Date();
  const apple = oauthConfig().apple;
  if (apple.bundleIds.length === 0) throw new AppError("OAUTH_PROVIDER_ERROR", { details: { reason: "not_configured" } });
  const claims = await verifyIdToken(apple.issuer, input.identityToken, apple.bundleIds, now);
  if (claims.nonce !== sha256Hex(input.rawNonce)) throw new AppError("OAUTH_STATE_EXPIRED", { details: { reason: "nonce_mismatch" } });
  const audience = Array.isArray(claims.aud) ? claims.aud.find((value) => apple.bundleIds.includes(value)) : claims.aud;
  let refreshTokenEnc: string | null = null;
  if (audience !== undefined && encryptionConfigured()) {
    try {
      const tokens = await exchangeAppleCode({ code: input.authorizationCode, clientId: audience, now });
      if (tokens.refresh_token !== undefined) refreshTokenEnc = encryptAppleRefreshToken({ token: tokens.refresh_token, clientId: audience });
    } catch {
      // The identity token is already verified; sign-in continues without a revocable token.
      refreshTokenEnc = null;
    }
  }
  const fullName = [input.fullName?.givenName, input.fullName?.familyName].filter((part): part is string => typeof part === "string" && part.trim().length > 0).join(" ");
  const identity = identityFromClaims("APPLE", claims, fullName.length > 0 ? fullName.slice(0, 120) : null, refreshTokenEnc);
  const resolution = await resolveIdentity(identity, { intent: input.intent, inviteCode: input.inviteCode }, now);
  if (resolution.kind === "signup") {
    // Native sign-up has no browser to open the company form; the app offers the browser flow instead.
    throw new AppError("ACCOUNT_NOT_INVITED", { details: { email: identity.email, reason: "native_signup_unsupported" } });
  }
  const org = await loadOrg(resolution.user.organizationId);
  const session = await issueSession(resolution.user, { ...meta, deviceId: input.deviceId, now });
  return { user: resolution.user, org, session };
}
