import { randomUUID } from "node:crypto";

import { IssueCategoryEnum, RoleEnum } from "@agrorende/contracts/enums";
import { AppError } from "@agrorende/contracts/errors";
import { LocaleSchema } from "@agrorende/contracts/settings";
import { collections, getDb, type User } from "@agrorende/db";
import { z } from "zod";

import { assertPasswordPolicy, hashPassword } from "../../auth/password";
import { activeAdminCount, createAuthLink, type ShareLink } from "../../auth/service";
import { revokeUserSessions } from "../../auth/tokens";
import type { Ctx } from "../../context";
import { toWire } from "../../sync/pull";
import { txDb } from "../../sync/touch";
import type { SyncTx } from "../../sync/types";
import { withSyncTx } from "../../sync/withSyncTx";
import type { PageParams } from "../../auth/http";
import type { UserDTO } from "./dto";

type Row = Record<string, unknown>;

const Name = z.string().trim().min(1).max(120);
const Email = z.string().trim().toLowerCase().email().max(254);
const Phone = z.string().trim().min(8).max(32);

export const UserCreateSchema = z.object({
  name: Name,
  email: Email.optional(),
  phone: Phone.optional(),
  role: RoleEnum,
  skills: z.array(IssueCategoryEnum).max(50).optional(),
  hourlyCostCents: z.number().int().nonnegative().optional(),
  homeSiteId: z.string().uuid().optional(),
  locale: LocaleSchema.optional(),
});

export const UserUpdateSchema = z
  .object({
    name: Name.optional(),
    email: Email.nullable().optional(),
    phone: Phone.nullable().optional(),
    skills: z.array(IssueCategoryEnum).max(50).optional(),
    hourlyCostCents: z.number().int().nonnegative().nullable().optional(),
    homeSiteId: z.string().uuid().nullable().optional(),
    vanStockLocationId: z.string().uuid().nullable().optional(),
    locale: LocaleSchema.optional(),
  })
  .strict();

function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED", { fieldErrors: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) });
  }
  return parsed.data;
}

/** Office view of a user: everything except credentials; labour cost follows `showLaborCostToManager`. */
export function officeUserDto(doc: User, viewer: Pick<Ctx, "role">, showLaborCostToManager = false): UserDTO {
  const row: Row = toWire(doc as unknown as Row);
  delete row.passwordHash;
  if (viewer.role !== "ADMIN" && !showLaborCostToManager) delete row.hourlyCostCents;
  row.status = userStatus(doc);
  return row as unknown as UserDTO;
}

export type UserStatus = "ACTIVE" | "INVITED" | "DISABLED" | "ARCHIVED";

export function userStatus(doc: Pick<User, "archivedAt" | "disabledAt" | "isActive" | "joinedAt" | "passwordHash">): UserStatus {
  if (doc.archivedAt !== null && doc.archivedAt !== undefined) return "ARCHIVED";
  if ((doc.disabledAt !== null && doc.disabledAt !== undefined) || !doc.isActive) return "DISABLED";
  if ((doc.joinedAt === null || doc.joinedAt === undefined) && (doc.passwordHash === null || doc.passwordHash === undefined)) return "INVITED";
  return "ACTIVE";
}

async function laborVisible(ctx: Ctx): Promise<boolean> {
  if (ctx.role === "ADMIN") return true;
  const org = await collections.organizations(await getDb()).findOne({ _id: ctx.organizationId }, { projection: { settings: 1 } });
  return org?.settings.showLaborCostToManager === true;
}

function assertVersion(current: { readonly syncVersion: number }, ifMatch: string | null | undefined): void {
  if (ifMatch === undefined || ifMatch === null || ifMatch.length === 0) return;
  if (ifMatch.replace(/^W\//u, "").replace(/"/gu, "") !== String(current.syncVersion)) {
    throw new AppError("CONFLICT", { details: { currentVersion: String(current.syncVersion) } });
  }
}

export interface UserListFilter {
  readonly role?: string | null;
  readonly active?: string | boolean | null;
  readonly q?: string | null;
}

/** `GET /users` (ADMIN, MANAGER). */
export async function listUsersAdmin(ctx: Ctx, filter: UserListFilter = {}, page: PageParams = { offset: 0, limit: 50 }) {
  const query: Row = { organizationId: ctx.organizationId, deletedAt: null };
  const role = RoleEnum.safeParse(filter.role);
  if (role.success) query.role = role.data;
  const active = filter.active === true || filter.active === "true" ? true : filter.active === false || filter.active === "false" ? false : null;
  if (active === true) Object.assign(query, { isActive: true, disabledAt: null, archivedAt: null });
  if (active === false) query.$or = [{ isActive: false }, { disabledAt: { $ne: null } }, { archivedAt: { $ne: null } }];
  if (typeof filter.q === "string" && filter.q.trim().length > 0) {
    const pattern = filter.q.trim().slice(0, 80).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    query.$and = [{ $or: [{ name: { $regex: pattern, $options: "i" } }, { email: { $regex: pattern, $options: "i" } }, { phone: { $regex: pattern } }] }];
  }
  const rows = await collections
    .users(await getDb())
    .find(query)
    .sort({ name: 1, _id: 1 })
    .skip(page.offset)
    .limit(page.limit + 1)
    .toArray();
  const labor = await laborVisible(ctx);
  const items = rows.slice(0, page.limit).map((doc) => officeUserDto(doc, ctx, labor));
  return { items, nextCursor: rows.length > page.limit ? String(page.offset + page.limit) : null };
}

async function loadUser(tx: SyncTx | null, ctx: Ctx, userId: string): Promise<User> {
  const user = tx === null ? await collections.users(await getDb()).findOne({ _id: userId, organizationId: ctx.organizationId }) : await txDb(tx).users.findOne({ _id: userId });
  if (user === null || (user.deletedAt !== null && user.deletedAt !== undefined)) throw new AppError("NOT_FOUND", { details: { entityType: "USER", id: userId } });
  return user;
}

export async function getUserAdmin(ctx: Ctx, userId: string): Promise<UserDTO> {
  return officeUserDto(await loadUser(null, ctx, userId), ctx, await laborVisible(ctx));
}

async function assertEmailFree(tx: SyncTx, email: string | null | undefined, exceptId?: string): Promise<void> {
  if (email === null || email === undefined) return;
  const clash = await txDb(tx).users.findOne({ email, deletedAt: null, ...(exceptId === undefined ? {} : { _id: { $ne: exceptId } }) }, { projection: { _id: 1 } });
  if (clash !== null) throw new AppError("VALIDATION_FAILED", { fieldErrors: [{ path: "email", code: "taken" }] });
}

/** `POST /users` (ADMIN): creates an invited user and returns the share link (§3.3). */
export async function createUser(ctx: Ctx, input: unknown, now: Date = new Date()): Promise<{ user: UserDTO; invite: ShareLink }> {
  const body = parse(UserCreateSchema, input);
  return withSyncTx(ctx, async (tx) => {
    await assertEmailFree(tx, body.email);
    const user: User = {
      _id: randomUUID(),
      organizationId: ctx.organizationId,
      syncVersion: tx.syncVersion,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      name: body.name,
      email: body.email ?? null,
      phone: body.phone ?? null,
      passwordHash: null,
      role: body.role,
      skills: body.skills ?? [],
      locale: body.locale ?? "pt-BR",
      hourlyCostCents: body.hourlyCostCents ?? null,
      avatarMediaId: null,
      isActive: true,
      joinedAt: null,
      disabledAt: null,
      archivedAt: null,
      invitedById: ctx.userId,
      mustChangePassword: false,
      dutyStatus: "OFF_DUTY",
      dutyChangedAt: null,
      locationConsentAt: null,
      scopeEpoch: 0,
      homeSiteId: body.homeSiteId ?? null,
      vanStockLocationId: null,
      lastSeenAt: null,
    } as User;
    await txDb(tx).users.insertOne(user);
    const invite = await createAuthLink(tx, { user, kind: "INVITE", createdById: ctx.userId, now });
    return { user: officeUserDto(user, ctx, true), invite };
  });
}

/** `PATCH /users/:id` (ADMIN) with `If-Match`. */
export async function updateUser(ctx: Ctx, userId: string, input: unknown, ifMatch?: string | null, now: Date = new Date()): Promise<UserDTO> {
  const body = parse(UserUpdateSchema, input);
  return withSyncTx(ctx, async (tx) => {
    const user = await loadUser(tx, ctx, userId);
    assertVersion(user, ifMatch);
    if (body.email !== undefined) await assertEmailFree(tx, body.email, userId);
    const set: Partial<User> = { syncVersion: tx.syncVersion, updatedAt: now };
    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined) (set as Row)[key] = value;
    }
    await txDb(tx).users.updateOne({ _id: userId }, { $set: set });
    return officeUserDto({ ...user, ...set }, ctx, true);
  });
}

function isActiveAdmin(user: User): boolean {
  return user.role === "ADMIN" && user.isActive && (user.disabledAt === null || user.disabledAt === undefined);
}

async function guardLastAdmin(tx: SyncTx, user: User): Promise<void> {
  if (isActiveAdmin(user) && (await activeAdminCount(tx, user._id)) === 0) throw new AppError("LAST_ADMIN");
}

/** `POST /users/:id/role` (ADMIN): bumps `scopeEpoch` and revokes the user's sessions. */
export async function setUserRole(ctx: Ctx, userId: string, input: unknown, now: Date = new Date()): Promise<UserDTO> {
  const body = parse(z.object({ role: RoleEnum }), input);
  const updated = await withSyncTx(ctx, async (tx) => {
    const user = await loadUser(tx, ctx, userId);
    if (user.role === body.role) return { user, changed: false };
    if (body.role !== "ADMIN") await guardLastAdmin(tx, user);
    const set: Partial<User> = { role: body.role, scopeEpoch: (user.scopeEpoch ?? 0) + 1, syncVersion: tx.syncVersion, updatedAt: now };
    await txDb(tx).users.updateOne({ _id: userId }, { $set: set });
    return { user: { ...user, ...set }, changed: true };
  });
  if (updated.changed) await revokeUserSessions(ctx.organizationId, userId, now);
  return officeUserDto(updated.user, ctx, true);
}

/** `POST /users/:id/deactivate` (ADMIN): sets `disabledAt`, keeps the data and revokes sessions. */
export async function deactivateUser(ctx: Ctx, userId: string, now: Date = new Date()): Promise<UserDTO> {
  const user = await withSyncTx(ctx, async (tx) => {
    const current = await loadUser(tx, ctx, userId);
    if (current.disabledAt !== null && current.disabledAt !== undefined) return current;
    await guardLastAdmin(tx, current);
    const set: Partial<User> = { isActive: false, disabledAt: now, dutyStatus: "OFF_DUTY", syncVersion: tx.syncVersion, updatedAt: now };
    await txDb(tx).users.updateOne({ _id: userId }, { $set: set });
    return { ...current, ...set };
  });
  await revokeUserSessions(ctx.organizationId, userId, now);
  return officeUserDto(user, ctx, true);
}

export async function reactivateUser(ctx: Ctx, userId: string, now: Date = new Date()): Promise<UserDTO> {
  const user = await withSyncTx(ctx, async (tx) => {
    const current = await loadUser(tx, ctx, userId);
    const set: Partial<User> = { isActive: true, disabledAt: null, archivedAt: null, syncVersion: tx.syncVersion, updatedAt: now };
    await txDb(tx).users.updateOne({ _id: userId }, { $set: set });
    return { ...current, ...set };
  });
  return officeUserDto(user, ctx, true);
}

/** `POST /users/:id/invite` (ADMIN): a fresh invite link for a user who has not joined. */
export async function inviteUser(ctx: Ctx, userId: string, now: Date = new Date()): Promise<ShareLink> {
  return withSyncTx(ctx, async (tx) => {
    const user = await loadUser(tx, ctx, userId);
    if (user.disabledAt !== null && user.disabledAt !== undefined) throw new AppError("ACCOUNT_DISABLED");
    return createAuthLink(tx, { user, kind: "INVITE", createdById: ctx.userId, now });
  });
}

/** `POST /users/:id/reset-link` (ADMIN): 24 h single-use password reset link. */
export async function resetLinkForUser(ctx: Ctx, userId: string, now: Date = new Date()): Promise<ShareLink> {
  return withSyncTx(ctx, async (tx) => {
    const user = await loadUser(tx, ctx, userId);
    if (user.disabledAt !== null && user.disabledAt !== undefined) throw new AppError("ACCOUNT_DISABLED");
    return createAuthLink(tx, { user, kind: "PASSWORD_RESET", createdById: ctx.userId, now });
  });
}

/** `POST /users/:id/temporary-password` (ADMIN): sets `mustChangePassword` and revokes sessions. */
export async function setTemporaryPassword(ctx: Ctx, userId: string, input: unknown, now: Date = new Date()): Promise<void> {
  const body = parse(z.object({ password: z.string() }), input);
  assertPasswordPolicy(body.password, "password");
  const passwordHash = await hashPassword(body.password);
  await withSyncTx(ctx, async (tx) => {
    const user = await loadUser(tx, ctx, userId);
    const set: Partial<User> = { passwordHash, mustChangePassword: true, joinedAt: user.joinedAt ?? now, syncVersion: tx.syncVersion, updatedAt: now };
    await txDb(tx).users.updateOne({ _id: userId }, { $set: set });
  });
  await revokeUserSessions(ctx.organizationId, userId, now);
}
