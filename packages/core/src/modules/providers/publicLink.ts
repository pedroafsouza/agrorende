import {
  ProviderCompleteInputSchema,
  ProviderCounterInputSchema,
  ProviderDeclineInputSchema,
  ProviderReviewReplyInputSchema,
  ProviderReviewReportInputSchema,
  type ProviderLinkViewDTO,
} from "@agrorende/contracts/dto";
import type { ProviderInviteStatus } from "@agrorende/contracts/enums";
import { collections, getDb, scoped, withSyncTx, type ProviderInvite, type ScopedDb } from "@agrorende/db";

import { enforceRateLimit } from "../../auth/rateLimit";
import { reject } from "../../errors";
import type { SyncTx } from "../../sync/types";
import { parseInput } from "../assets/kit";
import {
  effectiveStatus,
  hashProviderToken,
  isPendingStatus,
  isWellFormedProviderToken,
  mapUrl,
  PROVIDER_ENGAGED_TTL_MS,
  PROVIDER_LINK_RATE_LIMIT,
  toLinkInviteView,
  toReviewDto,
} from "./dto";
import { assertPayable, flagReview, recordProviderActivity } from "./service";

/**
 * The public magic-link side (issue #64). The provider has no account: the token is the only
 * credential, so every call hashes it, rate-limits by client address and re-checks the state.
 */
export interface ProviderLinkOptions {
  readonly now?: Date;
  /** Client address for the lookup rate limit; tests may omit it. */
  readonly clientKey?: string;
}

/** Why a link cannot be used; the page shows "ask the company for a new invite" for all three. */
export type ProviderLinkFailure = "invalid" | "expired" | "revoked";

function linkUnavailable(reason: ProviderLinkFailure): never {
  return reject("INVITE_EXPIRED", { reason });
}

async function findByToken(token: string, options: ProviderLinkOptions): Promise<ProviderInvite> {
  await enforceRateLimit(options.clientKey ?? "unknown", PROVIDER_LINK_RATE_LIMIT);
  if (!isWellFormedProviderToken(token)) return linkUnavailable("invalid");
  const invite = await collections.providerInvites(await getDb()).findOne({ tokenHash: hashProviderToken(token) });
  if (invite === null) return linkUnavailable("invalid");
  if (invite.status === "REVOKED") return linkUnavailable("revoked");
  return invite;
}

function tenantTx<T>(invite: ProviderInvite, fn: (tx: SyncTx, db: ScopedDb, current: ProviderInvite) => Promise<T>): Promise<T> {
  return withSyncTx({ orgId: invite.organizationId }, async (dbTx) => {
    const tx: SyncTx = dbTx;
    const current = await dbTx.db.provider_invites.findOne({ _id: invite._id });
    if (current === null || current.tokenHash !== invite.tokenHash) return linkUnavailable("invalid");
    if (current.status === "REVOKED") return linkUnavailable("revoked");
    return fn(tx, dbTx.db, current);
  });
}

/** Persists EXPIRED the first time an out-of-date pending invite is touched, then refuses the link. */
async function expireIfDue(invite: ProviderInvite, now: Date): Promise<void> {
  if (effectiveStatus(invite, now) === "EXPIRED" && invite.status !== "EXPIRED") {
    await tenantTx(invite, async (tx, db, current) => {
      if (current.status === "EXPIRED" || !isPendingStatus(current.status)) return;
      await db.provider_invites.updateOne({ _id: current._id }, { $set: { status: "EXPIRED", updatedAt: now } });
      await recordProviderActivity(tx, current, "expired", null);
    });
  }
  if (invite.expiresAt.getTime() <= now.getTime()) linkUnavailable("expired");
}

async function buildView(invite: ProviderInvite, now: Date): Promise<ProviderLinkViewDTO> {
  const db = scoped({ orgId: invite.organizationId }, await getDb());
  const organization = await collections.organizations(await getDb()).findOne({ _id: invite.organizationId }, { projection: { name: 1 } });
  const workOrder = await db.work_orders.findOne({ _id: invite.workOrderId });
  if (workOrder === null) return linkUnavailable("invalid");
  const asset = workOrder.assetId == null ? null : await db.assets.findOne({ _id: workOrder.assetId }, { projection: { name: 1, make: 1, model: 1 } });
  const site = workOrder.siteId == null ? null : await db.sites.findOne({ _id: workOrder.siteId }, { projection: { name: 1, city: 1, state: 1, lat: 1, lng: 1 } });
  const review = await db.provider_reviews.findOne({ inviteId: invite._id });
  const lat = workOrder.destLat ?? site?.lat ?? null;
  const lng = workOrder.destLng ?? site?.lng ?? null;
  return {
    organizationName: organization?.name ?? "",
    invite: toLinkInviteView(invite, now),
    workOrder: {
      number: workOrder.number,
      title: workOrder.title,
      description: workOrder.description ?? null,
      type: workOrder.type,
      scheduledFor: workOrder.scheduledFor ?? null,
      asset: asset === null ? null : { name: asset.name, make: asset.make ?? null, model: asset.model ?? null },
      site:
        site === null && (lat === null || lng === null)
          ? null
          : { name: site?.name ?? "", city: site?.city ?? null, state: site?.state ?? null, lat, lng, mapUrl: mapUrl(lat, lng) },
    },
    review: review === null ? null : toReviewDto(review),
  };
}

/** Opens the page: marks the invite OPENED on the first view (issue #64). */
export async function viewProviderLink(token: string, options: ProviderLinkOptions = {}): Promise<ProviderLinkViewDTO> {
  const now = options.now ?? new Date();
  const invite = await findByToken(token, options);
  await expireIfDue(invite, now);
  if (invite.status !== "SENT") return buildView(invite, now);
  const opened = await tenantTx(invite, async (tx, db, current) => {
    if (current.status !== "SENT") return current;
    const set = { status: "OPENED" as const, openedAt: now, updatedAt: now };
    await db.provider_invites.updateOne({ _id: current._id }, { $set: set });
    await recordProviderActivity(tx, current, "opened", null);
    return { ...current, ...set };
  });
  return buildView(opened, now);
}

type LinkStep = (tx: SyncTx, db: ScopedDb, invite: ProviderInvite, now: Date) => Promise<ProviderInvite>;

async function runStep(token: string, options: ProviderLinkOptions, step: LinkStep): Promise<ProviderLinkViewDTO> {
  const now = options.now ?? new Date();
  const invite = await findByToken(token, options);
  await expireIfDue(invite, now);
  const next = await tenantTx(invite, (tx, db, current) => step(tx, db, current, now));
  return buildView(next, now);
}

function transition(from: ProviderInviteStatus, context: string): never {
  return reject("INVALID_TRANSITION", { context, from });
}

async function assertWorkOrderActive(db: ScopedDb, invite: ProviderInvite): Promise<void> {
  const workOrder = await db.work_orders.findOne({ _id: invite.workOrderId }, { projection: { status: 1, deletedAt: 1 } });
  if (workOrder === null || workOrder.deletedAt != null) return linkUnavailable("invalid");
  if (workOrder.status === "CANCELLED") reject("WO_CANCELLED", {});
}

export async function acceptProviderLink(token: string, options: ProviderLinkOptions = {}): Promise<ProviderLinkViewDTO> {
  return runStep(token, options, async (tx, db, invite, now) => {
    if (invite.status === "ACCEPTED") return invite;
    if (!isPendingStatus(invite.status)) transition(invite.status, "notPending");
    await assertWorkOrderActive(db, invite);
    const set = { status: "ACCEPTED" as const, acceptedAt: now, respondedAt: invite.respondedAt ?? now, expiresAt: new Date(now.getTime() + PROVIDER_ENGAGED_TTL_MS), updatedAt: now };
    await db.provider_invites.updateOne({ _id: invite._id }, { $set: set });
    await recordProviderActivity(tx, invite, "accepted", null);
    return { ...invite, ...set };
  });
}

export async function declineProviderLink(token: string, raw: unknown, options: ProviderLinkOptions = {}): Promise<ProviderLinkViewDTO> {
  const input = parseInput(ProviderDeclineInputSchema, raw);
  return runStep(token, options, async (tx, db, invite, now) => {
    if (invite.status === "DECLINED") return invite;
    if (!isPendingStatus(invite.status)) transition(invite.status, "notPending");
    const set = { status: "DECLINED" as const, declineReason: input.reason ?? null, respondedAt: now, updatedAt: now };
    await db.provider_invites.updateOne({ _id: invite._id }, { $set: set });
    await recordProviderActivity(tx, invite, "declined", null, { reason: input.reason ?? null });
    return { ...invite, ...set };
  });
}

/** "Propose price/date": price arrives in cents (the page converts BRL), date as YYYY-MM-DD. */
export async function counterProviderLink(token: string, raw: unknown, options: ProviderLinkOptions = {}): Promise<ProviderLinkViewDTO> {
  const input = parseInput(ProviderCounterInputSchema, raw);
  return runStep(token, options, async (tx, db, invite, now) => {
    if (!isPendingStatus(invite.status)) transition(invite.status, "notPending");
    await assertWorkOrderActive(db, invite);
    const set = {
      status: "COUNTERED" as const,
      proposedPriceCents: input.priceCents ?? null,
      proposedDate: input.date ?? null,
      proposalNote: input.note ?? null,
      respondedAt: now,
      updatedAt: now,
    };
    await db.provider_invites.updateOne({ _id: invite._id }, { $set: set });
    await recordProviderActivity(tx, invite, "countered", null, { proposedPriceCents: set.proposedPriceCents, proposedDate: set.proposedDate, reason: set.proposalNote });
    return { ...invite, ...set };
  });
}

/** Provider marks the job done with a note. The work order itself is closed by the office. */
export async function completeProviderLink(token: string, raw: unknown, options: ProviderLinkOptions = {}): Promise<ProviderLinkViewDTO> {
  const input = parseInput(ProviderCompleteInputSchema, raw);
  return runStep(token, options, async (tx, db, invite, now) => {
    if (invite.status === "COMPLETED") return invite;
    if (invite.status !== "ACCEPTED") transition(invite.status, "notAccepted");
    await assertWorkOrderActive(db, invite);
    const set = { status: "COMPLETED" as const, completedAt: now, completionNote: input.note, expiresAt: new Date(now.getTime() + PROVIDER_ENGAGED_TTL_MS), updatedAt: now };
    await db.provider_invites.updateOne({ _id: invite._id }, { $set: set });
    await recordProviderActivity(tx, invite, "completed", null, { reason: input.note });
    return { ...invite, ...set };
  });
}

/** "Paid outside the platform", provider side. Idempotent. */
export async function markPaidByProvider(token: string, options: ProviderLinkOptions = {}): Promise<ProviderLinkViewDTO> {
  return runStep(token, options, async (tx, db, invite, now) => {
    if (invite.providerPaidAt != null) return invite;
    assertPayable(invite, now);
    const set = { providerPaidAt: now, updatedAt: now };
    await db.provider_invites.updateOne({ _id: invite._id }, { $set: set });
    await recordProviderActivity(tx, invite, "paidProvider", null, { agreedValueCents: invite.agreedValueCents ?? null, paymentMethod: invite.paymentMethod ?? null });
    return { ...invite, ...set };
  });
}

/** The provider's single reply to the customer's review. */
export async function replyToReviewByProvider(token: string, raw: unknown, options: ProviderLinkOptions = {}): Promise<ProviderLinkViewDTO> {
  const input = parseInput(ProviderReviewReplyInputSchema, raw);
  return runStep(token, options, async (tx, db, invite, now) => {
    const review = await db.provider_reviews.findOne({ inviteId: invite._id });
    if (review === null) return reject("NOT_FOUND", { entityType: "PROVIDER_REVIEW" });
    if (review.threadStatus === "CLOSED" || review.providerReply != null) reject("INVALID_TRANSITION", { context: "reviewThreadClosed" });
    await db.provider_reviews.updateOne({ _id: review._id }, { $set: { providerReply: { body: input.body, at: now, byId: null }, updatedAt: now } });
    await recordProviderActivity(tx, invite, "reviewReplied", null);
    return invite;
  });
}

export async function reportReviewByProvider(token: string, raw: unknown, options: ProviderLinkOptions = {}): Promise<ProviderLinkViewDTO> {
  const input = parseInput(ProviderReviewReportInputSchema, raw);
  return runStep(token, options, async (tx, db, invite, now) => {
    const review = await db.provider_reviews.findOne({ inviteId: invite._id });
    if (review === null) return reject("NOT_FOUND", { entityType: "PROVIDER_REVIEW" });
    await flagReview(tx, db, review, "PROVIDER", input.reason ?? null, null, now);
    return invite;
  });
}
