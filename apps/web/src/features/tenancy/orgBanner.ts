import type { OrgStatus, Role } from "@agrorende/contracts/enums";

import type { OrgStatusBannerTone } from "./OrgStatusBanner";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Mirrors `PAST_DUE_GRACE_DAYS` in `@agrorende/core/modules/tenancy/config`. */
export const PAST_DUE_GRACE_DAYS = 14;

export interface OrgBannerInput {
  readonly status: OrgStatus | undefined;
  readonly role: Role | null | undefined;
  readonly trialEndsAt?: string | null;
  readonly pastDueAt?: string | null;
  readonly purgeAfter?: string | null;
  readonly supportWhatsApp?: string | null;
  readonly now: Date;
}

export type OrgBannerAction = { readonly kind: "subscription"; readonly href: string } | { readonly kind: "whatsapp"; readonly href: string };

export interface OrgBannerDescriptor {
  readonly tone: OrgStatusBannerTone;
  /** Key inside the `tenancy` namespace, without the `.title` / `.body` suffix. */
  readonly key: string;
  readonly values: Readonly<Record<string, string | number>>;
  readonly action: OrgBannerAction | null;
}

export function whatsAppHref(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length === 0 ? null : `https://wa.me/${digits}`;
}

function daysUntil(iso: string | null | undefined, now: Date): number | null {
  if (iso === null || iso === undefined) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.ceil((at - now.getTime()) / DAY_MS));
}

function addDays(iso: string | null | undefined, days: number): string | null {
  if (iso === null || iso === undefined) return null;
  const at = Date.parse(iso);
  return Number.isNaN(at) ? null : new Date(at + days * DAY_MS).toISOString();
}

/**
 * Which banner an office user sees (T20.7, EC-OPS-29): the trial countdown is for ADMIN only, the
 * PAST_DUE warning for ADMIN and MANAGER, and the read-only banner for every office role when the
 * organisation is SUSPENDED or CANCELLED. FIELD users only see the mobile banner.
 */
export function orgBannerFor(input: OrgBannerInput): OrgBannerDescriptor | null {
  const { role, status, now } = input;
  if (status === undefined || status === "ACTIVE" || (role !== "ADMIN" && role !== "MANAGER")) return null;
  const subscription: OrgBannerAction | null = role === "ADMIN" ? { kind: "subscription", href: "/settings/subscription" } : null;
  const support = whatsAppHref(input.supportWhatsApp);
  const supportAction: OrgBannerAction | null = support === null ? subscription : { kind: "whatsapp", href: support };

  if (status === "TRIAL") {
    if (role !== "ADMIN") return null;
    return { tone: "trial", key: "banner.trial", values: { days: daysUntil(input.trialEndsAt, now) ?? 0, date: input.trialEndsAt ?? "" }, action: subscription };
  }
  if (status === "PAST_DUE") {
    const graceEnd = addDays(input.pastDueAt, PAST_DUE_GRACE_DAYS);
    return {
      tone: "past_due",
      key: role === "ADMIN" ? "banner.pastDue.admin" : "banner.pastDue.manager",
      values: { days: daysUntil(graceEnd, now) ?? PAST_DUE_GRACE_DAYS, date: graceEnd ?? "" },
      action: role === "ADMIN" ? supportAction : null,
    };
  }
  if (status === "SUSPENDED") {
    return { tone: "suspended", key: "banner.suspended", values: {}, action: supportAction };
  }
  return { tone: "cancelled", key: "banner.cancelled", values: { date: input.purgeAfter ?? "" }, action: supportAction };
}
