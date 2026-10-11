import {
  CreateProviderInviteInputSchema,
  CreateProviderReviewInputSchema,
  PROVIDER_INVITE_ACTIVE_STATUSES,
  ProviderAgreementInputSchema,
  ProviderReviewReplyInputSchema,
  ProviderReviewReportInputSchema,
  type ProviderInviteDTO,
  type ProviderInviteIssuedDTO,
  type ProviderReviewDTO,
} from "@agrorende/contracts/dto";
import type { ProviderInviteStatus } from "@agrorende/contracts/enums";
import type { ProviderInvite, ProviderReview, ScopedDb, WorkOrder } from "@agrorende/db";

import { recordActivity } from "../../activity/index";
import { authConfig } from "../../auth/config";
import { requireRole, type Ctx } from "../../context";
import { reject } from "../../errors";
import { emit } from "../../events/index";
import { OFFICE_ROLES } from "../../permissions";
import { txDb } from "../../sync/touch";
import type { SyncTx } from "../../sync/types";
import { newId, parseInput, readDb } from "../assets/kit";
import {
  effectiveStatus,
  generateProviderToken,
  hashProviderToken,
  isPendingStatus,
  PROVIDER_ENGAGED_TTL_MS,
  PROVIDER_INVITE_TTL_MS,
  providerLinkUrl,
  toInviteDto,
  toReviewDto,
} from "./dto";

export * from "./dto";

/** Outbox event for invites that carry an email; the payload never holds the token or the address. */
export const PROVIDER_INVITE_EMAIL_EVENT = "provider.inviteEmail";

export interface ProviderOptions {
  readonly now?: Date;
  readonly appUrl?: string;
}

type ProviderAction =
  | "invited"
  | "reissued"
  | "revoked"
  | "opened"
  | "accepted"
  | "declined"
  | "countered"
  | "counterAccepted"
  | "completed"
  | "expired"
  | "agreementSet"
  | "paidCustomer"
  | "paidProvider"
  | "reviewed"
  | "reviewReplied"
  | "reviewAnswered"
  | "reviewReported";

/** Every provider step lands in the work order's history (issue #64). */
export async function recordProviderActivity(
  tx: SyncTx,
  invite: Pick<ProviderInvite, "_id" | "workOrderId" | "providerName">,
  action: ProviderAction,
  actorId: string | null,
  extra: Readonly<Record<string, unknown>> = {},
): Promise<void> {
  await recordActivity(tx, {
    entityType: "WORK_ORDER",
    entityId: invite.workOrderId,
    action: `provider.${action}`,
    actorId,
    meta: { inviteId: invite._id, providerName: invite.providerName, ...extra },
  });
}

async function loadWorkOrder(db: ScopedDb, workOrderId: string): Promise<WorkOrder> {
  const workOrder = await db.work_orders.findOne({ _id: workOrderId, deletedAt: null });
  if (workOrder === null) return reject("NOT_FOUND", { entityType: "WORK_ORDER", id: workOrderId });
  return workOrder;
}

async function loadInvite(db: ScopedDb, workOrderId: string, inviteId: string): Promise<ProviderInvite> {
  const invite = await db.provider_invites.findOne({ _id: inviteId, workOrderId });
  if (invite === null) return reject("NOT_FOUND", { entityType: "PROVIDER_INVITE", id: inviteId });
  return invite;
}

async function loadReview(db: ScopedDb, workOrderId: string, reviewId: string): Promise<ProviderReview> {
  const review = await db.provider_reviews.findOne({ _id: reviewId, workOrderId });
  if (review === null) return reject("NOT_FOUND", { entityType: "PROVIDER_REVIEW", id: reviewId });
  return review;
}

function assertWorkOrderOpenForProvider(workOrder: WorkOrder): void {
  if (workOrder.status === "CANCELLED") reject("WO_CANCELLED", { workOrderId: workOrder._id });
  if (workOrder.status === "COMPLETED" || workOrder.status === "VERIFIED") {
    reject("INVALID_TRANSITION", { context: "workOrderClosed", from: workOrder.status });
  }
}

function transition(from: ProviderInviteStatus, context: string): never {
  return reject("INVALID_TRANSITION", { context, from });
}

async function assertNoActiveInvite(db: ScopedDb, workOrderId: string, now: Date, exceptId?: string): Promise<void> {
  const active = await db.provider_invites.find({ workOrderId, status: { $in: [...PROVIDER_INVITE_ACTIVE_STATUSES] } }).toArray();
  const blocking = active.filter((invite) => invite._id !== exceptId && effectiveStatus(invite, now) !== "EXPIRED");
  if (blocking.length > 0) transition(blocking[0]?.status ?? "SENT", "activeInviteExists");
}

function engagedExpiry(now: Date): Date {
  return new Date(now.getTime() + PROVIDER_ENGAGED_TTL_MS);
}

/** Lists the invites of one work order, newest first, each with its review (office only). */
export async function listInvites(ctx: Ctx, workOrderId: string, options: ProviderOptions = {}): Promise<{ items: ProviderInviteDTO[] }> {
  requireRole(ctx, OFFICE_ROLES);
  const now = options.now ?? new Date();
  const db = await readDb(ctx);
  await loadWorkOrder(db, workOrderId);
  const invites = await db.provider_invites.find({ workOrderId }, { sort: { createdAt: -1 } }).toArray();
  const reviews = await db.provider_reviews.find({ workOrderId }).toArray();
  const byInvite = new Map(reviews.map((review) => [review.inviteId, review]));
  return { items: invites.map((invite) => toInviteDto(invite, byInvite.get(invite._id) ?? null, now)) };
}

/**
 * "Invite from outside" (issue #63): one work order, a random token of which only the hash is
 * stored, seven days to answer. The plain link is returned once so the office can share it.
 */
export async function createInvite(tx: SyncTx, ctx: Ctx, workOrderId: string, raw: unknown, options: ProviderOptions = {}): Promise<ProviderInviteIssuedDTO> {
  requireRole(ctx, OFFICE_ROLES);
  const input = parseInput(CreateProviderInviteInputSchema, raw);
  const now = options.now ?? new Date();
  const db = txDb(tx);
  const workOrder = await loadWorkOrder(db, workOrderId);
  assertWorkOrderOpenForProvider(workOrder);
  await assertNoActiveInvite(db, workOrderId, now);
  const token = generateProviderToken();
  const doc: ProviderInvite = {
    _id: newId(now.getTime()),
    organizationId: ctx.orgId,
    workOrderId,
    tokenHash: hashProviderToken(token),
    providerName: input.providerName,
    phone: input.phone ?? null,
    email: input.email ?? null,
    message: input.message ?? null,
    status: "SENT",
    createdById: ctx.userId,
    expiresAt: new Date(now.getTime() + PROVIDER_INVITE_TTL_MS),
    createdAt: now,
    updatedAt: now,
  };
  await db.provider_invites.insertOne(doc);
  await recordProviderActivity(tx, doc, "invited", ctx.userId, { channel: doc.phone === null ? "EMAIL" : doc.email === null ? "WHATSAPP" : "WHATSAPP_EMAIL" });
  const url = providerLinkUrl(options.appUrl ?? authConfig().appUrl, token);
  if (doc.email !== null && doc.email !== undefined) await queueInviteEmail(tx, doc, url);
  return { invite: toInviteDto(doc, null, now), link: { url, expiresAt: doc.expiresAt.toISOString() } };
}

/**
 * There is no mail transport yet: the email leg goes to the outbox for a future sender, and in
 * development the link is printed so it can be opened by hand. Neither carries the address.
 */
async function queueInviteEmail(tx: SyncTx, invite: ProviderInvite, url: string): Promise<void> {
  await emit(tx, { type: PROVIDER_INVITE_EMAIL_EVENT, rooms: [], data: { inviteId: invite._id, workOrderId: invite.workOrderId } });
  if (process.env.NODE_ENV === "development") {
    process.stdout.write(`[providers] invite ${invite._id} email link (dev only): ${url}\n`);
  }
}

/**
 * Copy link / resend: only the hash is kept, so sharing the link again issues a fresh token and
 * the previous link stops working. An expired invite becomes SENT again for seven more days.
 */
export async function reissueInvite(tx: SyncTx, ctx: Ctx, workOrderId: string, inviteId: string, options: ProviderOptions = {}): Promise<ProviderInviteIssuedDTO> {
  requireRole(ctx, OFFICE_ROLES);
  const now = options.now ?? new Date();
  const db = txDb(tx);
  const invite = await loadInvite(db, workOrderId, inviteId);
  const status = effectiveStatus(invite, now);
  if (status === "REVOKED" || status === "DECLINED") transition(status, "inviteClosed");
  const workOrder = await loadWorkOrder(db, workOrderId);
  if (status === "EXPIRED") {
    assertWorkOrderOpenForProvider(workOrder);
    await assertNoActiveInvite(db, workOrderId, now, invite._id);
  }
  const token = generateProviderToken();
  const nextStatus: ProviderInviteStatus = status === "EXPIRED" ? "SENT" : invite.status;
  const expiresAt = isPendingStatus(nextStatus) ? new Date(now.getTime() + PROVIDER_INVITE_TTL_MS) : engagedExpiry(now);
  const set = { tokenHash: hashProviderToken(token), status: nextStatus, expiresAt, updatedAt: now };
  await db.provider_invites.updateOne({ _id: invite._id }, { $set: set });
  const next: ProviderInvite = { ...invite, ...set };
  await recordProviderActivity(tx, next, "reissued", ctx.userId);
  const url = providerLinkUrl(options.appUrl ?? authConfig().appUrl, token);
  const review = await db.provider_reviews.findOne({ inviteId: invite._id });
  return { invite: toInviteDto(next, review, now), link: { url, expiresAt: expiresAt.toISOString() } };
}

export async function revokeInvite(tx: SyncTx, ctx: Ctx, workOrderId: string, inviteId: string, options: ProviderOptions = {}): Promise<ProviderInviteDTO> {
  requireRole(ctx, OFFICE_ROLES);
  const now = options.now ?? new Date();
  const db = txDb(tx);
  const invite = await loadInvite(db, workOrderId, inviteId);
  if (invite.status === "REVOKED") return toInviteDto(invite, null, now);
  if (invite.status === "COMPLETED" || invite.status === "DECLINED") transition(invite.status, "inviteClosed");
  const set = { status: "REVOKED" as const, revokedAt: now, revokedById: ctx.userId, updatedAt: now };
  await db.provider_invites.updateOne({ _id: invite._id }, { $set: set });
  const next: ProviderInvite = { ...invite, ...set };
  await recordProviderActivity(tx, next, "revoked", ctx.userId);
  return toInviteDto(next, null, now);
}

/** Agreed value in cents and the expected off-platform method (issue #65). Locked once anyone confirmed payment. */
export async function setAgreement(tx: SyncTx, ctx: Ctx, workOrderId: string, inviteId: string, raw: unknown, options: ProviderOptions = {}): Promise<ProviderInviteDTO> {
  requireRole(ctx, OFFICE_ROLES);
  const input = parseInput(ProviderAgreementInputSchema, raw);
  const now = options.now ?? new Date();
  const db = txDb(tx);
  const invite = await loadInvite(db, workOrderId, inviteId);
  const status = effectiveStatus(invite, now);
  if (status === "REVOKED" || status === "DECLINED" || status === "EXPIRED") transition(status, "inviteClosed");
  if (invite.customerPaidAt != null || invite.providerPaidAt != null) transition(status, "paymentConfirmed");
  const set = { agreedValueCents: input.agreedValueCents, paymentMethod: input.paymentMethod, updatedAt: now };
  await db.provider_invites.updateOne({ _id: invite._id }, { $set: set });
  const next: ProviderInvite = { ...invite, ...set };
  await recordProviderActivity(tx, next, "agreementSet", ctx.userId, { agreedValueCents: input.agreedValueCents, paymentMethod: input.paymentMethod });
  const review = await db.provider_reviews.findOne({ inviteId: invite._id });
  return toInviteDto(next, review, now);
}

/** The office takes the provider's counter-proposal: the proposed price becomes the agreed value. */
export async function acceptCounter(tx: SyncTx, ctx: Ctx, workOrderId: string, inviteId: string, options: ProviderOptions = {}): Promise<ProviderInviteDTO> {
  requireRole(ctx, OFFICE_ROLES);
  const now = options.now ?? new Date();
  const db = txDb(tx);
  const invite = await loadInvite(db, workOrderId, inviteId);
  const status = effectiveStatus(invite, now);
  if (status !== "COUNTERED") transition(status, "counterMissing");
  assertWorkOrderOpenForProvider(await loadWorkOrder(db, workOrderId));
  const set = {
    status: "ACCEPTED" as const,
    acceptedAt: now,
    agreedValueCents: invite.proposedPriceCents ?? invite.agreedValueCents ?? null,
    expiresAt: engagedExpiry(now),
    updatedAt: now,
  };
  await db.provider_invites.updateOne({ _id: invite._id }, { $set: set });
  const next: ProviderInvite = { ...invite, ...set };
  await recordProviderActivity(tx, next, "counterAccepted", ctx.userId, { agreedValueCents: set.agreedValueCents, proposedDate: invite.proposedDate ?? null });
  return toInviteDto(next, null, now);
}

/** Payment confirmations need an accepted job with an agreed value (EC-PRV-05). */
export function assertPayable(invite: ProviderInvite, now: Date): void {
  const status = effectiveStatus(invite, now);
  if (status !== "ACCEPTED" && status !== "COMPLETED") transition(status, "notEngaged");
  if (invite.agreedValueCents === null || invite.agreedValueCents === undefined) transition(status, "agreementMissing");
}

/** "Paid outside the platform", customer side. AgroRende never moves the money. Idempotent. */
export async function markPaidByCustomer(tx: SyncTx, ctx: Ctx, workOrderId: string, inviteId: string, options: ProviderOptions = {}): Promise<ProviderInviteDTO> {
  requireRole(ctx, OFFICE_ROLES);
  const now = options.now ?? new Date();
  const db = txDb(tx);
  const invite = await loadInvite(db, workOrderId, inviteId);
  const review = await db.provider_reviews.findOne({ inviteId: invite._id });
  if (invite.customerPaidAt != null) return toInviteDto(invite, review, now);
  assertPayable(invite, now);
  const set = { customerPaidAt: now, customerPaidById: ctx.userId, updatedAt: now };
  await db.provider_invites.updateOne({ _id: invite._id }, { $set: set });
  const next: ProviderInvite = { ...invite, ...set };
  await recordProviderActivity(tx, next, "paidCustomer", ctx.userId, { agreedValueCents: invite.agreedValueCents ?? null, paymentMethod: invite.paymentMethod ?? null });
  return toInviteDto(next, review, now);
}

/** Review (issue #66): only a COMPLETED invite, once. */
export async function createReview(tx: SyncTx, ctx: Ctx, workOrderId: string, inviteId: string, raw: unknown, options: ProviderOptions = {}): Promise<ProviderReviewDTO> {
  requireRole(ctx, OFFICE_ROLES);
  const input = parseInput(CreateProviderReviewInputSchema, raw);
  const now = options.now ?? new Date();
  const db = txDb(tx);
  const invite = await loadInvite(db, workOrderId, inviteId);
  if (invite.status !== "COMPLETED") transition(invite.status, "inviteNotCompleted");
  const existing = await db.provider_reviews.findOne({ inviteId: invite._id });
  if (existing !== null) transition(invite.status, "reviewExists");
  const doc: ProviderReview = {
    _id: newId(now.getTime()),
    organizationId: ctx.orgId,
    workOrderId,
    inviteId: invite._id,
    providerName: invite.providerName,
    rating: input.rating,
    criteria: input.criteria,
    comment: input.comment ?? null,
    createdById: ctx.userId,
    providerReply: null,
    customerReply: null,
    threadStatus: "OPEN",
    moderationStatus: "NONE",
    reports: [],
    createdAt: now,
    updatedAt: now,
  };
  await db.provider_reviews.insertOne(doc);
  await recordProviderActivity(tx, invite, "reviewed", ctx.userId, { rating: input.rating });
  return toReviewDto(doc);
}

/** Thread rule: review → one provider reply → one final customer reply → closed. The customer has the last word. */
export async function customerReplyToReview(tx: SyncTx, ctx: Ctx, workOrderId: string, reviewId: string, raw: unknown, options: ProviderOptions = {}): Promise<ProviderReviewDTO> {
  requireRole(ctx, OFFICE_ROLES);
  const input = parseInput(ProviderReviewReplyInputSchema, raw);
  const now = options.now ?? new Date();
  const db = txDb(tx);
  const review = await loadReview(db, workOrderId, reviewId);
  if (review.threadStatus === "CLOSED" || review.customerReply != null) reject("INVALID_TRANSITION", { context: "reviewThreadClosed" });
  if (review.providerReply == null) reject("INVALID_TRANSITION", { context: "providerReplyMissing" });
  const set = { customerReply: { body: input.body, at: now, byId: ctx.userId }, threadStatus: "CLOSED" as const, updatedAt: now };
  await db.provider_reviews.updateOne({ _id: review._id }, { $set: set });
  await recordProviderActivity(tx, { _id: review.inviteId, workOrderId, providerName: review.providerName }, "reviewAnswered", ctx.userId);
  return toReviewDto({ ...review, ...set });
}

export async function reportReviewByCustomer(tx: SyncTx, ctx: Ctx, workOrderId: string, reviewId: string, raw: unknown, options: ProviderOptions = {}): Promise<ProviderReviewDTO> {
  requireRole(ctx, OFFICE_ROLES);
  const input = parseInput(ProviderReviewReportInputSchema, raw);
  const now = options.now ?? new Date();
  const db = txDb(tx);
  const review = await loadReview(db, workOrderId, reviewId);
  return flagReview(tx, db, review, "CUSTOMER", input.reason ?? null, ctx.userId, now);
}

/** Report = flag for moderation; the same party reporting twice changes nothing. */
export async function flagReview(
  tx: SyncTx,
  db: ScopedDb,
  review: ProviderReview,
  by: "CUSTOMER" | "PROVIDER",
  reason: string | null,
  actorId: string | null,
  now: Date,
): Promise<ProviderReviewDTO> {
  if (review.reports.some((report) => report.by === by)) return toReviewDto(review);
  const reports = [...review.reports, { by, reason, at: now }];
  const set = { reports, moderationStatus: "FLAGGED" as const, updatedAt: now };
  await db.provider_reviews.updateOne({ _id: review._id }, { $set: set });
  await recordProviderActivity(tx, { _id: review.inviteId, workOrderId: review.workOrderId, providerName: review.providerName }, "reviewReported", actorId, { by });
  return toReviewDto({ ...review, ...set });
}
