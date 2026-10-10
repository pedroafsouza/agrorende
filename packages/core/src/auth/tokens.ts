import { randomUUID } from "node:crypto";

import { AppError } from "@agrorende/contracts/errors";
import { collections, getDb } from "@agrorende/db";
import type { User } from "@agrorende/db";

import { signAccessToken } from "./jwt";
import { ACCESS_TOKEN_TTL_S, authConfig, DRAIN_SCOPE, DRAIN_TOKEN_TTL_MS, REFRESH_REUSE_GRACE_MS, REFRESH_TOKEN_TTL_MS } from "./config";
import { randomToken, sha256Hex } from "./password";

export interface IssuedSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accessExpiresAt: Date;
  readonly refreshExpiresAt: Date;
  readonly familyId: string;
}

export interface SessionMeta {
  readonly deviceId?: string | null;
  readonly userAgent?: string | null;
  readonly ip?: string | null;
  readonly now?: Date;
}

type TokenSubject = Pick<User, "_id" | "organizationId" | "role">;

export async function signAccess(user: TokenSubject, deviceId: string | null | undefined, now: Date = new Date()): Promise<{ token: string; expiresAt: Date }> {
  const token = await signAccessToken(
    { tokenUse: "access", sub: user._id, orgId: user.organizationId, role: user.role, ...(deviceId === null || deviceId === undefined ? {} : { deviceId }) },
    { secret: authConfig().jwtSecret, expiresIn: `${ACCESS_TOKEN_TTL_S}s` },
  );
  return { token, expiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_S * 1000) };
}

/** Issues an access JWT plus an opaque 256-bit refresh token stored as its SHA-256 hash (ARCHITECTURE §11). */
export async function issueSession(
  user: TokenSubject,
  meta: SessionMeta = {},
  familyId: string = randomUUID(),
  tokenId: string = randomUUID(),
): Promise<IssuedSession & { readonly tokenId: string }> {
  const now = meta.now ?? new Date();
  const refreshToken = randomToken(32);
  const refreshExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS);
  const db = await getDb();
  await collections.refreshTokens(db).insertOne({
    _id: tokenId,
    organizationId: user.organizationId,
    userId: user._id,
    familyId,
    tokenHash: sha256Hex(refreshToken),
    deviceId: meta.deviceId ?? null,
    expiresAt: refreshExpiresAt,
    revokedAt: null,
    replacedById: null,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
    ip: meta.ip ?? null,
    createdAt: now,
  });
  const access = await signAccess(user, meta.deviceId, now);
  return { accessToken: access.token, accessExpiresAt: access.expiresAt, refreshToken, refreshExpiresAt, familyId, tokenId };
}

export interface RotationResult {
  readonly user: User;
  readonly session: IssuedSession;
}

/**
 * Rotates a refresh token. A reuse inside the 30 s grace (parallel refreshes from one device)
 * gets a fresh pair in the same family; any later reuse revokes the whole family and throws
 * `REFRESH_REUSED`. Disabled users get `ACCOUNT_DISABLED` (the drain token comes from `drainForRefresh`).
 */
export async function rotateRefreshToken(token: string, meta: SessionMeta = {}): Promise<RotationResult> {
  const now = meta.now ?? new Date();
  const db = await getDb();
  const tokens = collections.refreshTokens(db);
  const row = await tokens.findOne({ tokenHash: sha256Hex(token) });
  if (row === null) throw new AppError("UNAUTHENTICATED", { details: { reason: "refresh_unknown" } });
  const user = await collections.users(db).findOne({ _id: row.userId, organizationId: row.organizationId });
  if (user === null || (user.deletedAt !== null && user.deletedAt !== undefined)) {
    throw new AppError("UNAUTHENTICATED", { details: { reason: "user_missing" } });
  }
  if (isDisabled(user)) {
    throw new AppError("ACCOUNT_DISABLED", await drainDetails(user, row, now));
  }
  const deviceId = row.deviceId ?? meta.deviceId ?? null;
  const revokeFamily = async (): Promise<never> => {
    await tokens.updateMany({ familyId: row.familyId, revokedAt: null }, { $set: { revokedAt: now } });
    throw new AppError("REFRESH_REUSED");
  };
  if (row.revokedAt !== null && row.revokedAt !== undefined) {
    const withinGrace = row.replacedById !== null && row.replacedById !== undefined && now.getTime() - row.revokedAt.getTime() <= REFRESH_REUSE_GRACE_MS;
    if (!withinGrace) return revokeFamily();
    return { user, session: await issueSession(user, { ...meta, deviceId, now }, row.familyId) };
  }
  if (row.expiresAt.getTime() <= now.getTime()) throw new AppError("TOKEN_EXPIRED", { details: { token: "refresh" } });
  const nextId = randomUUID();
  const claimed = await tokens.updateOne({ _id: row._id, revokedAt: null }, { $set: { revokedAt: now, replacedById: nextId } });
  if (claimed.modifiedCount === 0) {
    const current = await tokens.findOne({ _id: row._id });
    const replacedAt = current?.revokedAt;
    if (replacedAt === null || replacedAt === undefined || now.getTime() - replacedAt.getTime() > REFRESH_REUSE_GRACE_MS) return revokeFamily();
    return { user, session: await issueSession(user, { ...meta, deviceId, now }, row.familyId) };
  }
  return { user, session: await issueSession(user, { ...meta, deviceId, now }, row.familyId, nextId) };
}

export function isDisabled(user: Pick<User, "disabledAt" | "isActive">): boolean {
  return (user.disabledAt !== null && user.disabledAt !== undefined) || !user.isActive;
}

type RefreshRow = NonNullable<Awaited<ReturnType<typeof findRefreshRow>>>;

/**
 * A disabled user's device may obtain one `sync:drain` token (72 h from `disabledAt`) by
 * presenting the refresh token it held when access was turned off (ARCHITECTURE §7.3, §7.9).
 */
async function drainDetails(user: User, row: RefreshRow, now: Date): Promise<{ details?: Record<string, unknown> }> {
  const disabledAt = user.disabledAt;
  if (disabledAt === null || disabledAt === undefined) return {};
  const windowEnd = disabledAt.getTime() + DRAIN_TOKEN_TTL_MS;
  const heldAtDisable = row.createdAt.getTime() <= disabledAt.getTime() && (row.revokedAt === null || row.revokedAt === undefined || row.revokedAt.getTime() >= disabledAt.getTime());
  const unused = row.replacedById === null || row.replacedById === undefined;
  if (now.getTime() >= windowEnd || !heldAtDisable || !unused) return {};
  const db = await getDb();
  const drainId = randomUUID();
  const claimed = await collections.refreshTokens(db).updateOne({ _id: row._id, replacedById: null }, { $set: { replacedById: drainId, revokedAt: row.revokedAt ?? now } });
  if (claimed.modifiedCount === 0) return {};
  const expiresAt = new Date(windowEnd);
  const drainToken = await signDrainToken({ userId: user._id, organizationId: user.organizationId, role: user.role, deviceId: row.deviceId ?? null }, expiresAt, now);
  return { details: { drainToken, drainExpiresAt: expiresAt.toISOString() } };
}

export interface DrainPrincipal {
  readonly userId: string;
  readonly organizationId: string;
  readonly role: User["role"];
  readonly deviceId?: string | null;
}

export async function signDrainToken(principal: DrainPrincipal, expiresAt: Date, now: Date = new Date()): Promise<string> {
  const seconds = Math.max(1, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
  return signAccessToken(
    {
      tokenUse: "access",
      sub: principal.userId,
      orgId: principal.organizationId,
      role: principal.role,
      scope: DRAIN_SCOPE,
      ...(principal.deviceId === null || principal.deviceId === undefined ? {} : { deviceId: principal.deviceId }),
    },
    { secret: authConfig().jwtSecret, expiresIn: `${seconds}s` },
  );
}

/** Revokes the family of the given refresh token (logout). Unknown tokens are ignored. */
export async function revokeRefreshFamily(token: string, now: Date = new Date()): Promise<void> {
  const db = await getDb();
  const tokens = collections.refreshTokens(db);
  const row = await tokens.findOne({ tokenHash: sha256Hex(token) });
  if (row === null) return;
  await tokens.updateMany({ familyId: row.familyId, revokedAt: null }, { $set: { revokedAt: now } });
}

/** Revokes every live refresh token of a user (deactivation, role change, password reset). */
export async function revokeUserSessions(organizationId: string, userId: string, now: Date = new Date(), exceptFamilyId?: string): Promise<void> {
  const db = await getDb();
  await collections.refreshTokens(db).updateMany(
    { organizationId, userId, revokedAt: null, ...(exceptFamilyId === undefined ? {} : { familyId: { $ne: exceptFamilyId } }) },
    { $set: { revokedAt: now } },
  );
}

/** Finds the refresh row for a token without rotating it. */
export async function findRefreshRow(token: string) {
  return collections.refreshTokens(await getDb()).findOne({ tokenHash: sha256Hex(token) });
}

/** Revokes the live refresh tokens bound to one device of a user (mobile logout with a bearer token). */
export async function revokeDeviceSessions(organizationId: string, userId: string, deviceId: string, now: Date = new Date()): Promise<void> {
  await collections.refreshTokens(await getDb()).updateMany({ organizationId, userId, deviceId, revokedAt: null }, { $set: { revokedAt: now } });
}

/** The family of the newest live refresh token of a user's device, kept when other sessions are revoked. */
export async function currentDeviceFamily(organizationId: string, userId: string, deviceId: string | null | undefined): Promise<string | undefined> {
  if (deviceId === null || deviceId === undefined) return undefined;
  const row = await collections
    .refreshTokens(await getDb())
    .findOne({ organizationId, userId, deviceId, revokedAt: null }, { sort: { createdAt: -1 }, projection: { familyId: 1 } });
  return row?.familyId;
}
