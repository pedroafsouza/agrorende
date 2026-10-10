import { randomUUID } from "node:crypto";

import type { AuthMethod, Platform, Role } from "@agrorende/contracts/enums";
import { AppError } from "@agrorende/contracts/errors";
import { LocaleSchema, type Locale } from "@agrorende/contracts/settings";
import { collections, getDb } from "@agrorende/db";
import type { AuthLink, Organization, User } from "@agrorende/db";
import { SignJWT } from "jose";

import type { Ctx } from "../context";
import { writeOutbox } from "../notify/index";
import { toTableDto } from "../sync/pull";
import { txDb } from "../sync/touch";
import type { SyncTx } from "../sync/types";
import { withSyncTx } from "../sync/withSyncTx";
import { authConfig, INVITE_TTL_MS, RESET_LINK_TTL_MS, SOCKET_TOKEN_TTL_S } from "./config";
import { assertPasswordPolicy, hashPassword, needsRehash, randomCode, sha256Hex, verifyPassword } from "./password";
import { enforceRateLimit, RATE_LIMITS } from "./rateLimit";
import { isDisabled, issueSession, revokeUserSessions, rotateRefreshToken, type IssuedSession, type SessionMeta } from "./tokens";

type Row = Record<string, unknown>;

export function userCtx(user: Pick<User, "_id" | "organizationId" | "role">, deviceId: string | null = null): Ctx {
  return { organizationId: user.organizationId, orgId: user.organizationId, userId: user._id, role: user.role, deviceId };
}

/** The signed-in user's own DTO: every field except `passwordHash`. */
export function selfUserDto(user: User): Row {
  return toTableDto("users", user as unknown as Row, { userId: user._id, role: user.role });
}

export function organizationDto(org: Organization, viewer: Pick<User, "_id" | "role">): Row {
  return toTableDto("organization", org as unknown as Row, { userId: viewer._id, role: viewer.role });
}

async function loadOrg(organizationId: string): Promise<Organization> {
  const org = await collections.organizations(await getDb()).findOne({ _id: organizationId });
  if (org === null) throw new AppError("UNAUTHENTICATED", { details: { reason: "org_missing" } });
  return org;
}

export interface AuthResult {
  readonly user: User;
  readonly org: Organization;
  readonly session: IssuedSession;
}

export interface LoginInput {
  readonly email: string;
  readonly password: string;
  readonly deviceId?: string;
  readonly platform?: Platform;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function findLoginUser(email: string): Promise<User | null> {
  const users = await collections
    .users(await getDb())
    .find({ email: { $in: [email, email.toLowerCase()] }, deletedAt: null })
    .sort({ createdAt: 1 })
    .limit(5)
    .toArray();
  return users.find((user) => user.passwordHash !== null && user.passwordHash !== undefined) ?? users[0] ?? null;
}

async function expiredResetPending(user: User, now: Date): Promise<boolean> {
  const link = await collections
    .authLinks(await getDb())
    .findOne({ userId: user._id, kind: "PASSWORD_RESET", redeemedAt: null, revokedAt: null }, { sort: { createdAt: -1 } });
  return link !== null && link.expiresAt.getTime() <= now.getTime();
}

/** Email + password sign-in for invited users (ARCHITECTURE §8). `INVALID_CREDENTIALS` stays generic. */
export async function login(input: LoginInput, meta: SessionMeta & { readonly ip?: string | null } = {}): Promise<AuthResult> {
  const now = meta.now ?? new Date();
  const email = normalizeEmail(input.email);
  await enforceRateLimit(meta.ip ?? "unknown", RATE_LIMITS.loginIp);
  await enforceRateLimit(email, RATE_LIMITS.loginEmail);
  const user = await findLoginUser(email);
  if (user === null) throw new AppError("INVALID_CREDENTIALS");
  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) {
    if ((user.passwordHash === null || user.passwordHash === undefined) && (await expiredResetPending(user, now))) {
      throw new AppError("RESET_LINK_EXPIRED");
    }
    throw new AppError("INVALID_CREDENTIALS");
  }
  if (isDisabled(user)) throw new AppError("ACCOUNT_DISABLED");
  const set: Partial<User> = { lastSeenAt: now };
  if (needsRehash(user.passwordHash)) set.passwordHash = await hashPassword(input.password);
  await collections.users(await getDb()).updateOne({ _id: user._id }, { $set: set });
  const org = await loadOrg(user.organizationId);
  const session = await issueSession(user, { ...meta, deviceId: input.deviceId ?? null, now });
  return { user: { ...user, ...set }, org, session };
}

export async function refresh(token: string, meta: SessionMeta = {}): Promise<AuthResult> {
  const { user, session } = await rotateRefreshToken(token, meta);
  return { user, org: await loadOrg(user.organizationId), session };
}

export interface MeView {
  readonly user: Row;
  readonly role: Role;
  readonly signInMethods: readonly AuthMethod[];
  readonly org: Row;
  readonly settings: Organization["settings"];
}

export async function signInMethods(user: User): Promise<AuthMethod[]> {
  const identities = await collections.userIdentities(await getDb()).find({ userId: user._id }).toArray();
  const methods = new Set<AuthMethod>(identities.map((identity) => identity.provider));
  if (user.passwordHash !== null && user.passwordHash !== undefined && user.passwordHash.length > 0) methods.add("PASSWORD");
  return [...methods].sort();
}

async function loadSelf(ctx: Ctx): Promise<User> {
  const user = await collections.users(await getDb()).findOne({ _id: ctx.userId, organizationId: ctx.organizationId, deletedAt: null });
  if (user === null) throw new AppError("UNAUTHENTICATED");
  return user;
}

export async function me(ctx: Ctx): Promise<MeView> {
  const user = await loadSelf(ctx);
  const org = await loadOrg(user.organizationId);
  return { user: selfUserDto(user), role: user.role, signInMethods: await signInMethods(user), org: organizationDto(org, user), settings: org.settings };
}

/** `PATCH /me {locale}`: persists the user locale for notifications and PDFs. */
export async function updateMe(ctx: Ctx, input: unknown): Promise<Row> {
  const body = typeof input === "object" && input !== null ? (input as Row) : {};
  const parsed = LocaleSchema.safeParse(body.locale);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", { fieldErrors: [{ path: "locale", code: "invalid_enum_value" }] });
  const locale: Locale = parsed.data;
  return withSyncTx(ctx, async (tx) => {
    await txDb(tx).users.updateOne({ _id: ctx.userId }, { $set: { locale, updatedAt: new Date(), syncVersion: tx.syncVersion } });
    const user = await txDb(tx).users.findOne({ _id: ctx.userId });
    if (user === null) throw new AppError("UNAUTHENTICATED");
    return selfUserDto(user);
  });
}

export interface ChangePasswordInput {
  readonly current?: string;
  readonly next: string;
}

/** `POST /auth/change-password`: `current` is required unless `mustChangePassword` is set. Other sessions are revoked. */
export async function changePassword(ctx: Ctx, input: ChangePasswordInput, keepFamilyId?: string): Promise<void> {
  const user = await loadSelf(ctx);
  const next = assertPasswordPolicy(input.next, "next");
  const hasPassword = user.passwordHash !== null && user.passwordHash !== undefined && user.passwordHash.length > 0;
  if (hasPassword && !user.mustChangePassword) {
    if (input.current === undefined || !(await verifyPassword(input.current, user.passwordHash))) {
      throw new AppError("INVALID_CREDENTIALS", { fieldErrors: [{ path: "current", code: "invalid" }] });
    }
  }
  const now = new Date();
  await withSyncTx(ctx, async (tx) => {
    await txDb(tx).users.updateOne(
      { _id: ctx.userId },
      { $set: { passwordHash: await hashPassword(next), mustChangePassword: false, updatedAt: now, syncVersion: tx.syncVersion } },
    );
  });
  await revokeUserSessions(ctx.organizationId, ctx.userId, now, keepFamilyId);
}

/** Realtime gateway token: HS256, `aud: "realtime"`, 5 minutes (ARCHITECTURE §8). */
export async function socketToken(ctx: Ctx, now: Date = new Date()): Promise<{ token: string; expiresAt: string }> {
  const expiresAt = new Date(now.getTime() + SOCKET_TOKEN_TTL_S * 1000);
  const token = await new SignJWT({ userId: ctx.userId, orgId: ctx.organizationId, role: ctx.role, ...(ctx.deviceId === null || ctx.deviceId === undefined ? {} : { deviceId: ctx.deviceId }) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(ctx.userId)
    .setAudience("realtime")
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(new TextEncoder().encode(authConfig().jwtSecret));
  return { token, expiresAt: expiresAt.toISOString() };
}

// ───────── Invite and reset links ─────────

export interface ShareLink {
  readonly code: string;
  readonly url: string;
  readonly whatsappUrl: string;
  readonly expiresAt: string;
}

function whatsappUrl(phone: string | null | undefined, text: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export interface CreateLinkInput {
  readonly user: Pick<User, "_id" | "organizationId" | "role" | "email" | "phone">;
  readonly kind: AuthLink["kind"];
  readonly createdById: string;
  readonly now?: Date;
}

/** Creates a single-use invite (7 days) or reset (24 h) link; earlier open links of the same kind are revoked. */
export async function createAuthLink(tx: SyncTx | null, input: CreateLinkInput): Promise<ShareLink> {
  const now = input.now ?? new Date();
  const code = randomCode(10);
  const expiresAt = new Date(now.getTime() + (input.kind === "INVITE" ? INVITE_TTL_MS : RESET_LINK_TTL_MS));
  const doc: AuthLink = {
    _id: randomUUID(),
    organizationId: input.user.organizationId,
    userId: input.user._id,
    kind: input.kind,
    codeHash: sha256Hex(code),
    role: input.kind === "INVITE" ? input.user.role : null,
    email: input.user.email ?? null,
    createdById: input.createdById,
    expiresAt,
    redeemedAt: null,
    redeemedVia: null,
    revokedAt: null,
    createdAt: now,
  };
  if (tx === null) {
    const links = collections.authLinks(await getDb());
    await links.updateMany({ userId: input.user._id, kind: input.kind, redeemedAt: null, revokedAt: null }, { $set: { revokedAt: now } });
    await links.insertOne(doc);
  } else {
    const links = txDb(tx).auth_links;
    await links.updateMany({ userId: input.user._id, kind: input.kind, redeemedAt: null, revokedAt: null }, { $set: { revokedAt: now } });
    await links.insertOne(doc);
  }
  const url = `${authConfig().appUrl.replace(/\/$/, "")}/${input.kind === "INVITE" ? "i" : "r"}/${code}`;
  return { code, url, whatsappUrl: whatsappUrl(input.user.phone, url), expiresAt: expiresAt.toISOString() };
}

async function findLink(code: string, kind: AuthLink["kind"]): Promise<AuthLink | null> {
  return collections.authLinks(await getDb()).findOne({ codeHash: sha256Hex(code.trim().toUpperCase()), kind });
}

function linkUsable(link: AuthLink, now: Date): boolean {
  return (link.redeemedAt === null || link.redeemedAt === undefined) && (link.revokedAt === null || link.revokedAt === undefined) && link.expiresAt.getTime() > now.getTime();
}

async function linkUser(link: AuthLink): Promise<User> {
  const user = await collections.users(await getDb()).findOne({ _id: link.userId, organizationId: link.organizationId, deletedAt: null });
  if (user === null) throw new AppError("NOT_FOUND", { details: { entityType: "USER" } });
  return user;
}

export async function lookupInvite(code: string, now: Date = new Date()) {
  const link = await findLink(code, "INVITE");
  if (link === null) throw new AppError("NOT_FOUND", { details: { entityType: "INVITE" } });
  if (!linkUsable(link, now)) throw new AppError("INVITE_EXPIRED");
  const user = await linkUser(link);
  const org = await loadOrg(link.organizationId);
  const inviter = link.createdById === null || link.createdById === undefined ? null : await collections.users(await getDb()).findOne({ _id: link.createdById });
  return {
    organizationName: org.name,
    inviterName: inviter?.name ?? null,
    name: user.name,
    email: link.email ?? user.email ?? null,
    role: link.role ?? user.role,
    expiresAt: link.expiresAt.toISOString(),
    signInMethods: ["GOOGLE", "APPLE", "PASSWORD"] as AuthMethod[],
  };
}

export interface InvitePasswordInput {
  readonly password: string;
  readonly email?: string;
  readonly deviceId?: string;
  readonly platform?: Platform;
}

/** Redeems an invite with a password: activates the user and signs them in. */
export async function redeemInvitePassword(code: string, input: InvitePasswordInput, meta: SessionMeta = {}): Promise<AuthResult> {
  const now = meta.now ?? new Date();
  const link = await findLink(code, "INVITE");
  if (link === null) throw new AppError("NOT_FOUND", { details: { entityType: "INVITE" } });
  if (!linkUsable(link, now)) throw new AppError("INVITE_EXPIRED");
  const password = assertPasswordPolicy(input.password);
  const user = await linkUser(link);
  const email = input.email === undefined ? null : normalizeEmail(input.email);
  const invited = link.email ?? user.email ?? null;
  if (email !== null && invited !== null && invited.toLowerCase() !== email) throw new AppError("INVITE_EMAIL_MISMATCH");
  const passwordHash = await hashPassword(password);
  await withSyncTx(userCtx(user), async (tx) => {
    const claimed = await txDb(tx).auth_links.updateOne({ _id: link._id, redeemedAt: null }, { $set: { redeemedAt: now, redeemedVia: "PASSWORD" } });
    if (claimed.modifiedCount === 0) throw new AppError("INVITE_EXPIRED");
    await txDb(tx).users.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordHash,
          email: invited ?? email,
          isActive: true,
          joinedAt: user.joinedAt ?? now,
          mustChangePassword: false,
          ...(link.role === null || link.role === undefined ? {} : { role: link.role }),
          updatedAt: now,
          syncVersion: tx.syncVersion,
        },
      },
    );
  });
  const fresh = await linkUser(link);
  const org = await loadOrg(fresh.organizationId);
  const session = await issueSession(fresh, { ...meta, deviceId: input.deviceId ?? null, now });
  return { user: fresh, org, session };
}

export async function lookupReset(code: string, now: Date = new Date()) {
  const link = await findLink(code, "PASSWORD_RESET");
  if (link === null || !linkUsable(link, now)) throw new AppError("RESET_LINK_EXPIRED");
  const user = await linkUser(link);
  return { email: user.email ?? null, name: user.name, expiresAt: link.expiresAt.toISOString() };
}

/** Redeems a reset link (24 h, single use) and revokes every session of the user. */
export async function redeemReset(code: string, input: { readonly password: string }, now: Date = new Date()): Promise<void> {
  const link = await findLink(code, "PASSWORD_RESET");
  if (link === null || !linkUsable(link, now)) throw new AppError("RESET_LINK_EXPIRED");
  const password = assertPasswordPolicy(input.password);
  const user = await linkUser(link);
  const passwordHash = await hashPassword(password);
  await withSyncTx(userCtx(user), async (tx) => {
    const claimed = await txDb(tx).auth_links.updateOne({ _id: link._id, redeemedAt: null }, { $set: { redeemedAt: now, redeemedVia: "PASSWORD" } });
    if (claimed.modifiedCount === 0) throw new AppError("RESET_LINK_EXPIRED");
    await txDb(tx).users.updateOne({ _id: user._id }, { $set: { passwordHash, mustChangePassword: false, updatedAt: now, syncVersion: tx.syncVersion } });
  });
  await revokeUserSessions(user.organizationId, user._id, now);
}

// ───────── Account deletion ─────────

export const DELETE_CONFIRM_WORDS = ["DELETE", "EXCLUIR"] as const;

export async function activeAdminCount(tx: SyncTx, excludeUserId?: string): Promise<number> {
  const admins = await txDb(tx)
    .users.find({ role: "ADMIN", isActive: true, disabledAt: null, deletedAt: null, ...(excludeUserId === undefined ? {} : { _id: { $ne: excludeUserId } }) }, { projection: { _id: 1 } })
    .toArray();
  return admins.length;
}

/**
 * `DELETE /auth/me`: anonymizes the user, clears auth data and devices, deletes location pings
 * and keeps business records attributed to the anonymized user (ARCHITECTURE §11). Apple
 * identities get an `auth.appleRevoke` outbox event for the token revocation job.
 */
export async function deleteMe(ctx: Ctx, input: { readonly confirm?: unknown }, now: Date = new Date()): Promise<void> {
  const confirm = typeof input.confirm === "string" ? input.confirm.trim().toUpperCase() : "";
  if (!DELETE_CONFIRM_WORDS.some((word) => word === confirm)) {
    throw new AppError("VALIDATION_FAILED", { fieldErrors: [{ path: "confirm", code: "invalid" }] });
  }
  const db = await getDb();
  await withSyncTx(ctx, async (tx) => {
    const scoped = txDb(tx);
    const user = await scoped.users.findOne({ _id: ctx.userId, deletedAt: null });
    if (user === null) throw new AppError("UNAUTHENTICATED");
    if (user.role === "ADMIN" && (await activeAdminCount(tx, user._id)) === 0) throw new AppError("LAST_ADMIN");
    await scoped.users.updateOne(
      { _id: user._id },
      {
        $set: {
          name: `#${user._id.slice(0, 8)}`,
          email: null,
          phone: null,
          passwordHash: null,
          avatarMediaId: null,
          isActive: false,
          disabledAt: now,
          dutyStatus: "OFF_DUTY",
          locationConsentAt: null,
          mustChangePassword: false,
          deletedAt: now,
          updatedAt: now,
          syncVersion: tx.syncVersion,
        },
      },
    );
    const identities = await scoped.user_identities.find({ userId: user._id }).toArray();
    for (const identity of identities.filter((row) => row.provider === "APPLE")) {
      await writeOutbox(tx, "auth.appleRevoke", { rooms: [], data: { userId: user._id, identityId: identity._id, subject: identity.subject, hasRefreshToken: identity.providerRefreshTokenEnc !== null && identity.providerRefreshTokenEnc !== undefined } }, now);
    }
    await scoped.auth_links.updateMany({ userId: user._id, redeemedAt: null, revokedAt: null }, { $set: { revokedAt: now } });
  });
  await collections.userIdentities(db).deleteMany({ organizationId: ctx.organizationId, userId: ctx.userId, provider: { $ne: "APPLE" } });
  await collections.devices(db).deleteMany({ organizationId: ctx.organizationId, userId: ctx.userId });
  await collections.locationPings(db).deleteMany({ organizationId: ctx.organizationId, userId: ctx.userId });
  await revokeUserSessions(ctx.organizationId, ctx.userId, now);
}
