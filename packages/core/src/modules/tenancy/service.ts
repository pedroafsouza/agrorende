import { createHash, randomUUID } from "node:crypto";

import type { OrgStatus } from "@agrorende/contracts/enums";
import { AppError } from "@agrorende/contracts/errors";
import { orgRoom, RealtimeServerEvents } from "@agrorende/contracts/realtime";
import { E164Schema, LocaleSchema } from "@agrorende/contracts/settings";
import { collection, collections, getClient, getDb, withSyncTx, type Organization, type User, type UserIdentity } from "@agrorende/db";
import { z } from "zod";

import { enforceRateLimit } from "../../auth/rateLimit.js";
import { issueSession, type IssuedSession } from "../../auth/tokens.js";
import type { Ctx } from "../../context.js";
import { dispatchPending } from "../../events/index.js";
import { writeOutbox } from "../../notify/index.js";
import { DAY_MS, SIGNUP_RATE_LIMITS, tenancyConfig } from "./config.js";
import { defaultChecklistTemplates, defaultOrgSettings, defaultSequences } from "./defaults.js";
import type { GettingStartedDTO, GettingStartedStepId, SubscriptionDTO } from "./dto.js";
import { isReactivation, isReadOnlyStatus, nextLifecycleTransition, orgStatusDto, orgStatusEvent, statusPatch, type LifecyclePatch } from "./lifecycle.js";
import { SYSTEM_ACTOR } from "./purge.js";
import { issueSignupLoginCode, verifySignupLoginCode, verifySignupTicket } from "./signupTicket.js";
import { normalizeCnpj } from "./taxId.js";
import { readUsage, type Db } from "./usage.js";

export const EXPECTED_FIELD_USERS = ["1-5", "6-20", "21-50+"] as const;

function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const SignupOrganizationSchema = z.object({
  ticket: z.string().min(16).max(4096),
  name: z.string().trim().min(2).max(120),
  officePhone: z.string().trim().pipe(E164Schema),
  taxId: z
    .string()
    .trim()
    .max(32)
    .optional()
    .transform((value) => (value === undefined || value.length === 0 ? undefined : value))
    .refine((value) => value === undefined || normalizeCnpj(value) !== null, { message: "cnpj_invalid" }),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(40).optional(),
  timezone: z.string().trim().min(1).max(64).refine(validTimezone, { message: "timezone_invalid" }),
  locale: LocaleSchema,
  expectedFieldUsers: z.enum(EXPECTED_FIELD_USERS),
  acceptTerms: z.literal(true),
});
export type SignupOrganizationInput = z.infer<typeof SignupOrganizationSchema>;

export interface SignupMeta {
  readonly ip: string;
  readonly userAgent?: string | null;
  readonly deviceId?: string | null;
  readonly now?: Date;
}

export interface SignupResult {
  readonly organization: Organization;
  readonly user: User;
  readonly identity: UserIdentity;
  /** Web sign-up: the new ADMIN session (cookies). */
  readonly session: IssuedSession | null;
  /** Mobile sign-up: deep link that hands the one-time login code back to the app. */
  readonly appRedirect: string | null;
}

function identityKey(provider: string, subject: string): string {
  return createHash("sha256").update(`${provider}:${subject}`).digest("hex").slice(0, 32);
}

/**
 * Self-service company sign-up (TEN-01): verifies the Google/Apple ticket, rate-limits by IP and
 * identity, then creates the TRIAL organisation, its counters, number sequences, default checklist
 * templates, the ADMIN creator and the identity link in one transaction.
 */
export async function signupOrganization(input: SignupOrganizationInput, meta: SignupMeta): Promise<SignupResult> {
  const now = meta.now ?? new Date();
  await enforceRateLimit(`ip:${meta.ip}`, SIGNUP_RATE_LIMITS.ip);
  const ticket = await verifySignupTicket(input.ticket, now);
  await enforceRateLimit(`identity:${identityKey(ticket.provider, ticket.subject)}`, SIGNUP_RATE_LIMITS.identity);
  if (ticket.provider === "GOOGLE" && !ticket.emailVerified) {
    throw new AppError("OAUTH_PROVIDER_ERROR", { details: { reason: "email_unverified" } });
  }
  const db = await getDb();
  const existingIdentity = await collections.userIdentities(db).findOne({ provider: ticket.provider, subject: ticket.subject });
  if (existingIdentity !== null) throw new AppError("ACCOUNT_IN_OTHER_ORG", { details: { reason: "identity_in_use" } });
  if (ticket.email !== null) {
    const existingUser = await collections.users(db).findOne({ email: ticket.email.toLowerCase(), deletedAt: null }, { projection: { _id: 1 } });
    if (existingUser !== null) throw new AppError("ACCOUNT_IN_OTHER_ORG", { details: { reason: "email_in_use" } });
  }

  const config = tenancyConfig();
  const organizationId = randomUUID();
  const userId = randomUUID();
  const syncVersion = 1;
  const taxId = input.taxId === undefined ? null : normalizeCnpj(input.taxId);
  const organization: Organization = {
    _id: organizationId,
    name: input.name,
    legalName: null,
    taxId,
    timezone: input.timezone,
    locale: input.locale,
    supportedLocales: ["pt-BR", "en"],
    currency: "BRL",
    status: "TRIAL",
    plan: "trial",
    trialEndsAt: new Date(now.getTime() + config.trialDays * DAY_MS),
    pastDueAt: null,
    suspendedAt: null,
    cancelledAt: null,
    purgeAfter: null,
    termsVersion: config.termsVersion,
    termsAcceptedAt: now,
    termsAcceptedById: userId,
    signupSource: ticket.client === "app" ? "app" : "web",
    expectedFieldUsers: input.expectedFieldUsers,
    createdById: userId,
    settings: defaultOrgSettings(input.officePhone),
    syncVersion,
    createdAt: now,
    updatedAt: now,
  };
  const user: User = {
    _id: userId,
    organizationId,
    syncVersion,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    email: ticket.email?.toLowerCase() ?? null,
    name: ticket.name ?? ticket.email?.split("@")[0] ?? input.name,
    phone: null,
    passwordHash: null,
    role: "ADMIN",
    skills: [],
    locale: input.locale,
    hourlyCostCents: null,
    avatarMediaId: null,
    isActive: true,
    joinedAt: now,
    disabledAt: null,
    archivedAt: null,
    invitedById: null,
    mustChangePassword: false,
    dutyStatus: "OFF_DUTY",
    dutyChangedAt: null,
    locationConsentAt: null,
    scopeEpoch: 0,
    homeSiteId: null,
    vanStockLocationId: null,
    lastSeenAt: now,
  };
  const identity: UserIdentity = {
    _id: randomUUID(),
    organizationId,
    userId,
    provider: ticket.provider,
    subject: ticket.subject,
    email: ticket.email?.toLowerCase() ?? null,
    emailVerified: ticket.emailVerified,
    isPrivateRelay: ticket.isPrivateRelay,
    providerRefreshTokenEnc: null,
    lastUsedAt: now,
    createdAt: now,
  };

  const client = await getClient();
  const session = client.startSession();
  try {
    await session.withTransaction(
      async () => {
        await collections.organizations(db).insertOne(organization, { session });
        await collection(db, "sync_counters").insertOne({ _id: organizationId, value: syncVersion, horizonVersion: 0 }, { session });
        await collections.numberSequences(db).insertMany(defaultSequences(organizationId), { session });
        await collections.users(db).insertOne(user, { session });
        await collections.userIdentities(db).insertOne(identity, { session });
        await collections.checklistTemplates(db).insertMany(defaultChecklistTemplates(organizationId, syncVersion, now, input.locale), { session });
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" },
    );
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000) {
      throw new AppError("ACCOUNT_IN_OTHER_ORG", { details: { reason: "identity_in_use" } });
    }
    throw error;
  } finally {
    await session.endSession();
  }

  if (ticket.client === "app" && ticket.appRedirectUri !== undefined && ticket.codeChallenge !== undefined) {
    const code = await issueSignupLoginCode({ userId, orgId: organizationId, codeChallenge: ticket.codeChallenge, now });
    const separator = ticket.appRedirectUri.includes("?") ? "&" : "?";
    return { organization, user, identity, session: null, appRedirect: `${ticket.appRedirectUri}${separator}code=${encodeURIComponent(code)}` };
  }
  const issued = await issueSession(user, { ip: meta.ip, userAgent: meta.userAgent ?? null, deviceId: meta.deviceId ?? null, now });
  return { organization, user, identity, session: issued, appRedirect: null };
}

async function loadOrganization(organizationId: string, db?: Db): Promise<Organization> {
  const org = await collections.organizations(db ?? (await getDb())).findOne({ _id: organizationId });
  if (org === null) throw new AppError("NOT_FOUND", { details: { entityType: "ORGANIZATION" } });
  return org;
}

export interface StatusChangeOptions {
  readonly now: Date;
  /** Post-commit dispatch of the outbox rows; tests pass a no-op. */
  readonly dispatch?: (ids: readonly string[]) => Promise<unknown>;
}

export interface StatusChangeResult {
  readonly before: Organization;
  readonly after: Organization;
  readonly eventIds: readonly string[];
}

/**
 * Writes a lifecycle change and, in the same transaction, the `org:status` event for every socket of
 * the organisation. Reactivation also writes `sync:poke` so held field outboxes flush (EC-PLT-40).
 */
export async function applyStatusChange(organizationId: string, patch: LifecyclePatch | (Partial<Organization> & { readonly status?: OrgStatus }), options: StatusChangeOptions): Promise<StatusChangeResult> {
  const db = await getDb();
  const before = await loadOrganization(organizationId, db);
  const eventIds: string[] = [];
  const after = await withSyncTx({ orgId: organizationId }, async (tx) => {
    const updated = await collections.organizations(db).findOneAndUpdate(
      { _id: organizationId },
      { $set: { ...patch, syncVersion: tx.syncVersion, updatedAt: options.now } },
      { session: tx.session, returnDocument: "after" },
    );
    if (updated === null) throw new AppError("NOT_FOUND", { details: { entityType: "ORGANIZATION" } });
    if (updated.status !== before.status || patch.status !== undefined) {
      eventIds.push(await writeOutbox(tx, RealtimeServerEvents.orgStatus, { rooms: [orgRoom(organizationId)], data: orgStatusEvent(updated) }, options.now));
    }
    if (isReactivation(before.status, updated.status)) {
      eventIds.push(await writeOutbox(tx, RealtimeServerEvents.syncPoke, { rooms: [orgRoom(organizationId)], data: { reason: "org_reactivated" } }, options.now));
    }
    return updated;
  });
  const dispatch = options.dispatch ?? ((ids: readonly string[]) => dispatchPending(ids));
  if (eventIds.length > 0) await dispatch(eventIds);
  return { before, after, eventIds };
}

/** Office mutation gate (EC-OPS-29): SUSPENDED and CANCELLED organisations are read-only; exports stay allowed. */
export async function assertOrgWritable(organizationId: string): Promise<void> {
  const org = await collections
    .organizations(await getDb())
    .findOne({ _id: organizationId }, { projection: { status: 1, suspendedAt: 1, cancelledAt: 1, purgeAfter: 1 } });
  if (org === null) throw new AppError("NOT_FOUND", { details: { entityType: "ORGANIZATION" } });
  if (isReadOnlyStatus(org.status)) {
    throw new AppError("ORG_SUSPENDED", {
      details: {
        status: org.status,
        suspendedAt: org.suspendedAt?.toISOString() ?? null,
        cancelledAt: org.cancelledAt?.toISOString() ?? null,
        purgeAfter: org.purgeAfter?.toISOString() ?? null,
        supportWhatsApp: tenancyConfig().supportWhatsApp,
      },
    });
  }
}

function assertAdmin(ctx: Ctx): void {
  if (ctx.role !== "ADMIN") throw new AppError(ctx.role === "FIELD" ? "OFFICE_ROLE_REQUIRED" : "FORBIDDEN");
}

/** Getting-started checklist (TEN-10): a step is complete when its data exists or the flag was set. */
export async function gettingStarted(organizationId: string, db?: Db): Promise<GettingStartedDTO> {
  const database = db ?? (await getDb());
  const org = await loadOrganization(organizationId, database);
  const flags = org.settings.onboarding.steps;
  const [assets, users, invites, devices] = await Promise.all([
    collections.assets(database).countDocuments({ organizationId, deletedAt: null }, { limit: 1 }),
    collections.users(database).countDocuments({ organizationId, deletedAt: null }, { limit: 2 }),
    collections.authLinks(database).countDocuments({ organizationId, kind: "INVITE" }, { limit: 1 }),
    collections.devices(database).countDocuments({ organizationId }, { limit: 1 }),
  ]);
  const done: Record<GettingStartedStepId, boolean> = {
    assets: flags.assets || assets > 0,
    team: flags.team || users > 1 || invites > 0,
    qr: flags.qr,
    app: flags.app || devices > 0,
  };
  const steps = (["assets", "team", "qr", "app"] as const).map((id) => ({ id, completed: done[id] }));
  return { steps, completed: steps.every((step) => step.completed), dismissedAt: org.settings.onboarding.dismissedAt ?? null };
}

function exportDeadline(org: Organization): string | null {
  return org.purgeAfter?.toISOString() ?? null;
}

/** `GET /org/subscription` (TEN-04): status, plan, terms, export window and six months of usage of the caller's own org. */
export async function getSubscription(ctx: Ctx): Promise<SubscriptionDTO> {
  assertAdmin(ctx);
  const db = await getDb();
  const org = await loadOrganization(ctx.organizationId, db);
  const config = tenancyConfig();
  const [usage, started] = await Promise.all([readUsage(ctx.organizationId, 6, db), gettingStarted(ctx.organizationId, db)]);
  return {
    organizationId: org._id,
    name: org.name,
    ...orgStatusDto(org),
    terms: {
      currentVersion: config.termsVersion,
      acceptedVersion: org.termsVersion ?? null,
      acceptedAt: org.termsAcceptedAt?.toISOString() ?? null,
      needsAcceptance: org.termsVersion !== config.termsVersion,
    },
    readOnly: isReadOnlyStatus(org.status),
    exportDeadline: exportDeadline(org),
    supportWhatsApp: config.supportWhatsApp,
    usage,
    gettingStarted: started,
  };
}

export const CancelOrganizationSchema = z.object({ confirmName: z.string().trim().min(1).max(120) });
export const AcceptTermsSchema = z.object({ version: z.string().trim().min(1).max(40) });

function sameName(a: string, b: string): boolean {
  const normalize = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
  return normalize(a) === normalize(b);
}

/** `POST /org/cancel` (TEN-07): the ADMIN types the company name; data stays 90 days for export, then `orgs.purge`. */
export async function cancelOrganization(ctx: Ctx, input: z.infer<typeof CancelOrganizationSchema>, options: Partial<StatusChangeOptions> = {}): Promise<SubscriptionDTO> {
  assertAdmin(ctx);
  const now = options.now ?? new Date();
  const db = await getDb();
  const org = await loadOrganization(ctx.organizationId, db);
  if (!sameName(org.name, input.confirmName)) {
    throw new AppError("VALIDATION_FAILED", { fieldErrors: [{ path: "confirmName", code: "name_mismatch" }] });
  }
  if (org.status !== "CANCELLED") {
    const patch = statusPatch("CANCELLED", now, { current: org });
    await applyStatusChange(ctx.organizationId, patch, { now, ...(options.dispatch === undefined ? {} : { dispatch: options.dispatch }) });
    const actor = await collections.users(db).findOne({ _id: ctx.userId, organizationId: ctx.organizationId }, { projection: { email: 1 } });
    await collections.platformAuditEvents(db).insertOne({
      _id: randomUUID(),
      actorEmail: actor?.email ?? SYSTEM_ACTOR,
      action: "org.status.change",
      organizationId: ctx.organizationId,
      reason: "cancelled by company admin",
      details: { from: org.status, to: "CANCELLED", by: "tenant", userId: ctx.userId },
      createdAt: now,
    });
  }
  return getSubscription(ctx);
}

/** `POST /org/accept-terms`: re-acceptance of the current terms version by an ADMIN. */
export async function acceptTerms(ctx: Ctx, input: z.infer<typeof AcceptTermsSchema>, now: Date = new Date()): Promise<SubscriptionDTO> {
  assertAdmin(ctx);
  const current = tenancyConfig().termsVersion;
  if (input.version !== current) {
    throw new AppError("VALIDATION_FAILED", { fieldErrors: [{ path: "version", code: "terms_version_outdated", params: { current } }] });
  }
  await withSyncTx({ orgId: ctx.organizationId }, async (tx) => {
    const db = await getDb();
    await collections.organizations(db).updateOne(
      { _id: ctx.organizationId },
      { $set: { termsVersion: current, termsAcceptedAt: now, termsAcceptedById: ctx.userId, syncVersion: tx.syncVersion, updatedAt: now } },
      { session: tx.session },
    );
  });
  return getSubscription(ctx);
}

/** Org status for any signed-in user of the org (banners, `useMe`). */
export async function orgStatus(organizationId: string) {
  return orgStatusDto(await loadOrganization(organizationId));
}

const SIGNUP_CODE_SINGLE_USE = { name: "signup-login-code", limit: 1, windowMs: 10 * 60 * 1000 } as const;

/**
 * Mobile finish of a sign-up started in the app: exchanges the one-time code from the deep link plus
 * the app's PKCE verifier for a normal session. A code works once.
 */
export async function redeemSignupLoginCode(code: string, verifier: string, meta: Omit<SignupMeta, "ip"> & { readonly ip?: string } = {}): Promise<{ user: User; organization: Organization; session: IssuedSession }> {
  const now = meta.now ?? new Date();
  const claims = await verifySignupLoginCode(code, verifier, now);
  try {
    await enforceRateLimit(`jti:${claims.jti}`, SIGNUP_CODE_SINGLE_USE);
  } catch {
    throw new AppError("OAUTH_STATE_EXPIRED", { details: { reason: "signup_login_code_used" } });
  }
  const db = await getDb();
  const user = await collections.users(db).findOne({ _id: claims.sub, organizationId: claims.org, deletedAt: null });
  if (user === null) throw new AppError("UNAUTHENTICATED");
  const organization = await loadOrganization(claims.org, db);
  const session = await issueSession(user, { ip: meta.ip ?? null, userAgent: meta.userAgent ?? null, deviceId: meta.deviceId ?? null, now });
  return { user, organization, session };
}

export interface LifecycleRunResult {
  readonly changed: readonly { readonly organizationId: string; readonly from: OrgStatus; readonly to: OrgStatus }[];
}

/**
 * `orgs.lifecycle` (TEN-05): TRIAL past `trialEndsAt` becomes PAST_DUE; PAST_DUE for 14 days becomes
 * SUSPENDED. Each change emits `org:status`; staff changes go through the platform console instead.
 */
export async function runLifecycle(now: Date, options: { readonly dispatch?: StatusChangeOptions["dispatch"] } = {}): Promise<LifecycleRunResult> {
  const db = await getDb();
  const candidates = await collections
    .organizations(db)
    .find({ status: { $in: ["TRIAL", "PAST_DUE"] } }, { projection: { _id: 1, status: 1, trialEndsAt: 1, pastDueAt: 1, suspendedAt: 1, cancelledAt: 1, purgeAfter: 1 } })
    .toArray();
  const changed: { organizationId: string; from: OrgStatus; to: OrgStatus }[] = [];
  for (const org of candidates) {
    const patch = nextLifecycleTransition(org, now);
    if (patch === null) continue;
    await applyStatusChange(org._id, patch, { now, ...(options.dispatch === undefined ? {} : { dispatch: options.dispatch }) });
    changed.push({ organizationId: org._id, from: org.status, to: patch.status });
  }
  return { changed };
}
