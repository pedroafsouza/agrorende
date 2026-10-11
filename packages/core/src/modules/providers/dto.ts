import { createHash, randomBytes } from "node:crypto";

import {
  PROVIDER_INVITE_PENDING_STATUSES,
  PROVIDER_LINK_TOKEN_PATTERN,
  type ProviderInviteDTO,
  type ProviderLinkViewDTO,
  type ProviderReviewDTO,
} from "@agrorende/contracts/dto";
import type { ProviderInviteStatus, ProviderReviewParty } from "@agrorende/contracts/enums";
import type { ProviderInvite, ProviderReview } from "@agrorende/db";

export type { ProviderInviteDTO, ProviderLinkViewDTO, ProviderReviewDTO };

/** Pending invites live seven days (issue #63). */
export const PROVIDER_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Once accepted the link stays usable long enough to finish, confirm payment and answer a review. */
export const PROVIDER_ENGAGED_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** Public link lookups per client address and minute (ERRORS EC-PRV-03). */
export const PROVIDER_LINK_RATE_LIMIT = { name: "provider-link", limit: 30, windowMs: 60_000 } as const;

export function generateProviderToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only this hash is stored; lookups hash the presented token and compare hashes. */
export function hashProviderToken(token: string): string {
  return createHash("sha256").update(`provider-link:${token}`).digest("hex");
}

export function isWellFormedProviderToken(token: string): boolean {
  return PROVIDER_LINK_TOKEN_PATTERN.test(token);
}

export function providerLinkUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/u, "")}/p/${token}`;
}

export function isPendingStatus(status: ProviderInviteStatus): boolean {
  return (PROVIDER_INVITE_PENDING_STATUSES as readonly ProviderInviteStatus[]).includes(status);
}

/** Status as the user should see it: a pending invite past its expiry reads EXPIRED even before it is persisted. */
export function effectiveStatus(invite: Pick<ProviderInvite, "status" | "expiresAt">, now: Date): ProviderInviteStatus {
  return isPendingStatus(invite.status) && invite.expiresAt.getTime() <= now.getTime() ? "EXPIRED" : invite.status;
}

function iso(value: Date | null | undefined): string | null {
  return value === null || value === undefined ? null : value.toISOString();
}

export function toReviewDto(doc: ProviderReview): ProviderReviewDTO {
  const reportedBy: ProviderReviewParty[] = [...new Set(doc.reports.map((report) => report.by))];
  return {
    id: doc._id,
    workOrderId: doc.workOrderId,
    inviteId: doc.inviteId,
    providerName: doc.providerName,
    rating: doc.rating,
    criteria: { ...doc.criteria },
    comment: doc.comment ?? null,
    createdAt: doc.createdAt.toISOString(),
    providerReply: doc.providerReply === null || doc.providerReply === undefined ? null : { body: doc.providerReply.body, at: doc.providerReply.at.toISOString() },
    customerReply: doc.customerReply === null || doc.customerReply === undefined ? null : { body: doc.customerReply.body, at: doc.customerReply.at.toISOString() },
    threadStatus: doc.threadStatus,
    moderationStatus: doc.moderationStatus,
    reportedBy,
  };
}

export function toInviteDto(doc: ProviderInvite, review: ProviderReview | null, now: Date): ProviderInviteDTO {
  return {
    id: doc._id,
    workOrderId: doc.workOrderId,
    providerName: doc.providerName,
    phone: doc.phone ?? null,
    email: doc.email ?? null,
    message: doc.message ?? null,
    status: effectiveStatus(doc, now),
    expiresAt: doc.expiresAt.toISOString(),
    createdAt: doc.createdAt.toISOString(),
    openedAt: iso(doc.openedAt),
    respondedAt: iso(doc.respondedAt),
    declineReason: doc.declineReason ?? null,
    proposedPriceCents: doc.proposedPriceCents ?? null,
    proposedDate: doc.proposedDate ?? null,
    proposalNote: doc.proposalNote ?? null,
    acceptedAt: iso(doc.acceptedAt),
    completedAt: iso(doc.completedAt),
    completionNote: doc.completionNote ?? null,
    revokedAt: iso(doc.revokedAt),
    agreedValueCents: doc.agreedValueCents ?? null,
    paymentMethod: doc.paymentMethod ?? null,
    customerPaidAt: iso(doc.customerPaidAt),
    providerPaidAt: iso(doc.providerPaidAt),
    review: review === null ? null : toReviewDto(review),
  };
}

export function toLinkInviteView(doc: ProviderInvite, now: Date): ProviderLinkViewDTO["invite"] {
  return {
    providerName: doc.providerName,
    status: effectiveStatus(doc, now),
    message: doc.message ?? null,
    expiresAt: doc.expiresAt.toISOString(),
    declineReason: doc.declineReason ?? null,
    proposedPriceCents: doc.proposedPriceCents ?? null,
    proposedDate: doc.proposedDate ?? null,
    proposalNote: doc.proposalNote ?? null,
    acceptedAt: iso(doc.acceptedAt),
    completedAt: iso(doc.completedAt),
    completionNote: doc.completionNote ?? null,
    agreedValueCents: doc.agreedValueCents ?? null,
    paymentMethod: doc.paymentMethod ?? null,
    customerPaidAt: iso(doc.customerPaidAt),
    providerPaidAt: iso(doc.providerPaidAt),
  };
}

export function mapUrl(lat: number | null | undefined, lng: number | null | undefined): string | null {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return null;
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
