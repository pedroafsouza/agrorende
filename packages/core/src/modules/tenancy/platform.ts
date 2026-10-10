import { createHash, randomBytes, randomUUID } from "node:crypto";

import { OrgStatusEnum } from "@agrorende/contracts/enums";
import { AppError } from "@agrorende/contracts/errors";
import { collections, getDb, type Organization, type PlatformAuditEvent } from "@agrorende/db";
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTVerifyGetKey } from "jose";
import { z } from "zod";

import { authConfig } from "../../auth/config";
import { createAuthLink, type ShareLink } from "../../auth/service";
import { PLATFORM_AUDIENCE, PLATFORM_SESSION_TTL_S, tenancyConfig } from "./config";
import type { PlatformAuditDTO, PlatformOrgDetailDTO, PlatformOrgRowDTO } from "./dto";
import { orgStatusDto, statusPatch, type LifecyclePatch } from "./lifecycle";
import { applyStatusChange, type StatusChangeOptions } from "./service";
import { readUsage, usageDto, type Db } from "./usage";

const OAUTH_STATE_TTL_S = 10 * 60;
const OAUTH_STATE_AUDIENCE = "platform-oauth";

function secret(): Uint8Array {
  const value = authConfig().jwtSecret;
  if (value.length === 0) throw new AppError("INTERNAL", { details: { reason: "jwt_secret_missing" } });
  return new TextEncoder().encode(value);
}

export interface StaffSession {
  readonly email: string;
  readonly expiresAt: Date;
}

/** True when the e-mail is listed in `PLATFORM_ADMIN_EMAILS`. */
export function isPlatformAdmin(email: string): boolean {
  return tenancyConfig().platformAdminEmails.includes(email.trim().toLowerCase());
}

/** Signs the `ar_platform` cookie value: `aud: "platform"`, 8 hours, subject is the staff e-mail. */
export async function issueStaffSession(email: string, now: Date = new Date()): Promise<{ token: string; expiresAt: Date }> {
  const iat = Math.floor(now.getTime() / 1000);
  const expiresAt = new Date((iat + PLATFORM_SESSION_TTL_S) * 1000);
  const token = await new SignJWT({ tokenUse: "platform" })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(PLATFORM_AUDIENCE)
    .setSubject(email.trim().toLowerCase())
    .setJti(randomUUID())
    .setIssuedAt(iat)
    .setExpirationTime(iat + PLATFORM_SESSION_TTL_S)
    .sign(secret());
  return { token, expiresAt };
}

/**
 * Verifies the `ar_platform` token. Tenant access tokens (other audience) and staff removed from
 * `PLATFORM_ADMIN_EMAILS` are rejected with `UNAUTHENTICATED`; staff never get a tenant `ctx`.
 */
export async function verifyStaffSession(token: string | null | undefined, now: Date = new Date()): Promise<StaffSession> {
  if (token === null || token === undefined || token.length === 0) throw new AppError("UNAUTHENTICATED");
  let email: string;
  let exp: number;
  try {
    const { payload } = await jwtVerify(token, secret(), { audience: PLATFORM_AUDIENCE, algorithms: ["HS256"], currentDate: now });
    if (payload.tokenUse !== "platform" || typeof payload.sub !== "string" || typeof payload.exp !== "number") throw new Error("claims");
    email = payload.sub;
    exp = payload.exp;
  } catch {
    throw new AppError("UNAUTHENTICATED");
  }
  if (!isPlatformAdmin(email)) throw new AppError("UNAUTHENTICATED");
  return { email, expiresAt: new Date(exp * 1000) };
}

// ---------------------------------------------------------------------------------------------
// Staff Google sign-in (OIDC authorization code + PKCE + nonce)
// ---------------------------------------------------------------------------------------------

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface OidcDeps {
  readonly fetch?: FetchLike;
  /** Test seam: key resolver for ID-token verification instead of the remote JWKS. */
  readonly jwks?: JWTVerifyGetKey;
  readonly now?: Date;
}

interface Discovery {
  readonly authorization_endpoint: string;
  readonly token_endpoint: string;
  readonly jwks_uri: string;
  readonly issuer: string;
}

const DiscoverySchema = z.object({
  issuer: z.string().url(),
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
  jwks_uri: z.string().url(),
});

async function discover(fetcher: FetchLike): Promise<Discovery> {
  const issuer = tenancyConfig().google.issuer.replace(/\/$/, "");
  try {
    const response = await fetcher(`${issuer}/.well-known/openid-configuration`);
    if (!response.ok) throw new Error(`discovery ${response.status}`);
    return DiscoverySchema.parse(await response.json());
  } catch {
    throw new AppError("OAUTH_PROVIDER_ERROR", { details: { reason: "discovery_failed" } });
  }
}

function googleConfigured(): { clientId: string; clientSecret: string } {
  const { clientId, clientSecret } = tenancyConfig().google;
  if (clientId.length === 0) throw new AppError("OAUTH_PROVIDER_ERROR", { details: { reason: "not_configured" } });
  return { clientId, clientSecret };
}

export function platformCallbackUrl(): string {
  return `${authConfig().appUrl.replace(/\/$/, "")}/api/v1/platform/auth/google/callback`;
}

/** Starts staff sign-in: returns the provider URL and the signed state cookie value (10 minutes). */
export async function startStaffGoogle(options: { readonly loginHint?: string | null } = {}, deps: OidcDeps = {}): Promise<{ url: string; stateCookie: string }> {
  const { clientId } = googleConfigured();
  const discovery = await discover(deps.fetch ?? fetch);
  const state = randomBytes(24).toString("base64url");
  const nonce = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const iat = Math.floor((deps.now ?? new Date()).getTime() / 1000);
  const stateCookie = await new SignJWT({ state, nonce, verifier })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(OAUTH_STATE_AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + OAUTH_STATE_TTL_S)
    .sign(secret());
  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", platformCallbackUrl());
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  if (options.loginHint !== undefined && options.loginHint !== null && options.loginHint.length > 0) url.searchParams.set("login_hint", options.loginHint);
  return { url: url.toString(), stateCookie };
}

const StateClaimsSchema = z.object({ state: z.string(), nonce: z.string(), verifier: z.string() });

/**
 * Finishes staff sign-in: checks state, exchanges the code with PKCE, verifies the ID token (issuer,
 * audience, nonce, `email_verified`) and the allow-list, then issues the `ar_platform` session.
 */
export async function finishStaffGoogle(
  input: { readonly code: string | null; readonly state: string | null; readonly stateCookie: string | null | undefined },
  deps: OidcDeps = {},
): Promise<{ email: string; token: string; expiresAt: Date }> {
  const now = deps.now ?? new Date();
  if (input.code === null || input.state === null || input.stateCookie === null || input.stateCookie === undefined) {
    throw new AppError("OAUTH_STATE_EXPIRED", { details: { reason: "missing_state" } });
  }
  let stored: z.infer<typeof StateClaimsSchema>;
  try {
    const { payload } = await jwtVerify(input.stateCookie, secret(), { audience: OAUTH_STATE_AUDIENCE, algorithms: ["HS256"], currentDate: now });
    stored = StateClaimsSchema.parse(payload);
  } catch {
    throw new AppError("OAUTH_STATE_EXPIRED", { details: { reason: "state_expired" } });
  }
  if (stored.state !== input.state) throw new AppError("OAUTH_STATE_EXPIRED", { details: { reason: "state_mismatch" } });
  const { clientId, clientSecret } = googleConfigured();
  const fetcher = deps.fetch ?? fetch;
  const discovery = await discover(fetcher);
  let idToken: string;
  try {
    const response = await fetcher(discovery.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: input.code,
        redirect_uri: platformCallbackUrl(),
        client_id: clientId,
        client_secret: clientSecret,
        code_verifier: stored.verifier,
      }).toString(),
    });
    if (!response.ok) throw new Error(`token ${response.status}`);
    const body = z.object({ id_token: z.string() }).parse(await response.json());
    idToken = body.id_token;
  } catch {
    throw new AppError("OAUTH_PROVIDER_ERROR", { details: { reason: "token_exchange_failed" } });
  }
  let claims: Record<string, unknown>;
  try {
    const keys = deps.jwks ?? createRemoteJWKSet(new URL(discovery.jwks_uri));
    const { payload } = await jwtVerify(idToken, keys, { issuer: discovery.issuer, audience: clientId, currentDate: now });
    claims = { ...payload };
  } catch {
    throw new AppError("OAUTH_PROVIDER_ERROR", { details: { reason: "id_token_invalid" } });
  }
  if (claims.nonce !== stored.nonce) throw new AppError("OAUTH_STATE_EXPIRED", { details: { reason: "nonce_mismatch" } });
  const verified = claims.email_verified === true || claims.email_verified === "true";
  if (typeof claims.email !== "string" || !verified) throw new AppError("OAUTH_PROVIDER_ERROR", { details: { reason: "email_unverified" } });
  if (!isPlatformAdmin(claims.email)) throw new AppError("FORBIDDEN", { details: { reason: "not_platform_admin" } });
  const session = await issueStaffSession(claims.email, now);
  return { email: claims.email.toLowerCase(), ...session };
}

// ---------------------------------------------------------------------------------------------
// Console queries and actions (metadata only, never tenant business data)
// ---------------------------------------------------------------------------------------------

function orgRow(org: Organization, latest: PlatformOrgRowDTO["latestUsage"]): PlatformOrgRowDTO {
  return {
    id: org._id,
    name: org.name,
    ...orgStatusDto(org),
    signupSource: org.signupSource ?? null,
    expectedFieldUsers: org.expectedFieldUsers ?? null,
    createdAt: org.createdAt.toISOString(),
    latestUsage: latest,
  };
}

function auditDto(row: PlatformAuditEvent): PlatformAuditDTO {
  return { id: row._id, actorEmail: row.actorEmail, action: row.action, reason: row.reason ?? null, details: row.details ?? null, createdAt: row.createdAt.toISOString() };
}

export const PlatformListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: OrgStatusEnum.optional(),
});

/** `GET /platform/orgs`: every organisation with its latest usage row. */
export async function listPlatformOrgs(_staff: StaffSession, query: z.infer<typeof PlatformListQuerySchema> = {}, dbOverride?: Db): Promise<PlatformOrgRowDTO[]> {
  const db = dbOverride ?? (await getDb());
  const filter: Record<string, unknown> = {};
  if (query.status !== undefined) filter.status = query.status;
  if (query.q !== undefined && query.q.length > 0) filter.name = { $regex: query.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  const orgs = await collections
    .organizations(db)
    .find(filter as never, { sort: { createdAt: -1 }, limit: 500 })
    .toArray();
  const usage = await collections
    .orgUsage(db)
    .aggregate<{ _id: string; row: Parameters<typeof usageDto>[0] }>([
      { $match: { organizationId: { $in: orgs.map((org) => org._id) } } },
      { $sort: { month: -1 } },
      { $group: { _id: "$organizationId", row: { $first: "$$ROOT" } } },
    ])
    .toArray();
  const latest = new Map(usage.map((entry) => [entry._id, usageDto(entry.row)]));
  return orgs.map((org) => orgRow(org, latest.get(org._id) ?? null));
}

/** `GET /platform/orgs/:id`: organisation metadata, six months of usage, ADMIN users and the audit trail. */
export async function getPlatformOrg(_staff: StaffSession, organizationId: string, dbOverride?: Db): Promise<PlatformOrgDetailDTO> {
  const db = dbOverride ?? (await getDb());
  const org = await collections.organizations(db).findOne({ _id: organizationId });
  if (org === null) throw new AppError("NOT_FOUND", { details: { entityType: "ORGANIZATION" } });
  const [usage, admins, audit] = await Promise.all([
    readUsage(organizationId, 6, db),
    collections
      .users(db)
      .find({ organizationId, role: "ADMIN", deletedAt: null }, { projection: { _id: 1, name: 1, email: 1, isActive: 1 }, sort: { name: 1 } })
      .toArray(),
    collections.platformAuditEvents(db).find({ organizationId }, { sort: { createdAt: -1 }, limit: 100 }).toArray(),
  ]);
  return {
    ...orgRow(org, usage[0] ?? null),
    timezone: org.timezone,
    locale: org.locale,
    officePhone: org.settings.officePhone ?? null,
    termsVersion: org.termsVersion ?? null,
    termsAcceptedAt: org.termsAcceptedAt?.toISOString() ?? null,
    usage,
    admins: admins.map((user) => ({ id: user._id, name: user.name, email: user.email ?? null, isActive: user.isActive })),
    audit: audit.map(auditDto),
  };
}

export const PlatformPatchSchema = z
  .object({
    status: OrgStatusEnum.optional(),
    plan: z.string().trim().min(1).max(40).optional(),
    trialEndsAt: z.coerce.date().optional(),
    reason: z.string().trim().min(3).max(500),
  })
  .refine((value) => value.status !== undefined || value.plan !== undefined || value.trialEndsAt !== undefined, { message: "nothing_to_change", path: ["status"] });
export type PlatformPatchInput = z.infer<typeof PlatformPatchSchema>;

async function audit(db: Db, row: Omit<PlatformAuditEvent, "_id">): Promise<void> {
  await collections.platformAuditEvents(db).insertOne({ _id: randomUUID(), ...row });
}

/**
 * `PATCH /platform/orgs/:id`: staff status, plan and trial changes. Every change writes its own
 * `PlatformAuditEvent`; status changes emit `org:status` (and `sync:poke` on reactivation).
 */
export async function patchPlatformOrg(staff: StaffSession, organizationId: string, input: PlatformPatchInput, options: Partial<StatusChangeOptions> = {}): Promise<PlatformOrgDetailDTO> {
  const now = options.now ?? new Date();
  const db = await getDb();
  const org = await collections.organizations(db).findOne({ _id: organizationId });
  if (org === null) throw new AppError("NOT_FOUND", { details: { entityType: "ORGANIZATION" } });
  const patch: Partial<Organization> & { status?: Organization["status"] } = {};
  if (input.status !== undefined && input.status !== org.status) {
    const trialEndsAt = input.trialEndsAt ?? (input.status === "TRIAL" ? (org.trialEndsAt ?? null) : undefined);
    Object.assign(patch, statusPatch(input.status, now, { current: org, ...(trialEndsAt === undefined ? {} : { trialEndsAt }) }) satisfies LifecyclePatch);
  } else if (input.trialEndsAt !== undefined) {
    patch.trialEndsAt = input.trialEndsAt;
    if (org.status === "PAST_DUE" && input.trialEndsAt.getTime() > now.getTime()) {
      Object.assign(patch, statusPatch("TRIAL", now, { current: org, trialEndsAt: input.trialEndsAt }));
    }
  }
  if (input.plan !== undefined && input.plan !== org.plan) patch.plan = input.plan;
  if (Object.keys(patch).length > 0) {
    await applyStatusChange(organizationId, patch, { now, ...(options.dispatch === undefined ? {} : { dispatch: options.dispatch }) });
  }
  const after = patch.status ?? org.status;
  if (after !== org.status) {
    await audit(db, { actorEmail: staff.email, action: "org.status.change", organizationId, reason: input.reason, details: { from: org.status, to: after }, createdAt: now });
  }
  if (patch.plan !== undefined) {
    await audit(db, { actorEmail: staff.email, action: "org.plan.change", organizationId, reason: input.reason, details: { from: org.plan, to: patch.plan }, createdAt: now });
  }
  if (input.trialEndsAt !== undefined && (org.trialEndsAt?.getTime() ?? null) !== input.trialEndsAt.getTime()) {
    await audit(db, {
      actorEmail: staff.email,
      action: "org.trial.extend",
      organizationId,
      reason: input.reason,
      details: { from: org.trialEndsAt?.toISOString() ?? null, to: input.trialEndsAt.toISOString() },
      createdAt: now,
    });
  }
  return getPlatformOrg(staff, organizationId, db);
}

export const AdminResetLinkSchema = z.object({ userId: z.string().uuid(), reason: z.string().trim().min(3).max(500) });

/** `POST /platform/orgs/:id/admin-reset-link`: a one-time reset link for one ADMIN of that organisation. */
export async function platformAdminResetLink(staff: StaffSession, organizationId: string, input: z.infer<typeof AdminResetLinkSchema>, now: Date = new Date()): Promise<ShareLink> {
  const db = await getDb();
  const user = await collections.users(db).findOne({ _id: input.userId, organizationId, role: "ADMIN", deletedAt: null });
  if (user === null) throw new AppError("NOT_FOUND", { details: { entityType: "USER" } });
  const link = await createAuthLink(null, { user, kind: "PASSWORD_RESET", createdById: user._id, now });
  await audit(db, { actorEmail: staff.email, action: "org.adminResetLink", organizationId, reason: input.reason, details: { userId: user._id, expiresAt: link.expiresAt }, createdAt: now });
  return link;
}
