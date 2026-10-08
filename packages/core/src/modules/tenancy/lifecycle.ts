import type { OrgStatus } from "@agrorende/contracts/enums";
import type { Organization } from "@agrorende/db";

import { DAY_MS, PAST_DUE_GRACE_DAYS, PURGE_AFTER_DAYS } from "./config.js";
import type { OrgStatusDTO, OrgStatusEventData } from "./dto.js";

export type LifecycleFields = Pick<Organization, "status" | "trialEndsAt" | "pastDueAt" | "suspendedAt" | "cancelledAt" | "purgeAfter">;
export type LifecyclePatch = Partial<Omit<LifecycleFields, "status">> & { readonly status: OrgStatus };

const ACCESS_PAUSED: readonly OrgStatus[] = ["SUSPENDED", "CANCELLED"];

/** SUSPENDED and CANCELLED organisations are read-only for office users (EC-OPS-29). */
export function isReadOnlyStatus(status: OrgStatus): boolean {
  return ACCESS_PAUSED.includes(status);
}

/** Moving from a paused or past-due state back to TRIAL/ACTIVE: held field outboxes must flush. */
export function isReactivation(from: OrgStatus, to: OrgStatus): boolean {
  return (from === "SUSPENDED" || from === "CANCELLED" || from === "PAST_DUE") && (to === "ACTIVE" || to === "TRIAL");
}

/**
 * The fields to write when an organisation enters `to` (manual staff change, cancellation or the
 * daily job). Timestamps of the state being entered are set; those of states left behind are cleared.
 */
export function statusPatch(to: OrgStatus, now: Date, options: { readonly trialEndsAt?: Date | null; readonly current?: LifecycleFields } = {}): LifecyclePatch {
  const current = options.current;
  switch (to) {
    case "TRIAL":
      return {
        status: "TRIAL",
        trialEndsAt: options.trialEndsAt ?? current?.trialEndsAt ?? null,
        pastDueAt: null,
        suspendedAt: null,
        cancelledAt: null,
        purgeAfter: null,
      };
    case "ACTIVE":
      return { status: "ACTIVE", pastDueAt: null, suspendedAt: null, cancelledAt: null, purgeAfter: null };
    case "PAST_DUE":
      return { status: "PAST_DUE", pastDueAt: current?.status === "PAST_DUE" ? (current.pastDueAt ?? now) : now, suspendedAt: null, cancelledAt: null, purgeAfter: null };
    case "SUSPENDED":
      return { status: "SUSPENDED", suspendedAt: current?.status === "SUSPENDED" ? (current.suspendedAt ?? now) : now, cancelledAt: null, purgeAfter: null };
    case "CANCELLED": {
      const cancelledAt = current?.status === "CANCELLED" ? (current.cancelledAt ?? now) : now;
      return { status: "CANCELLED", cancelledAt, purgeAfter: new Date(cancelledAt.getTime() + PURGE_AFTER_DAYS * DAY_MS) };
    }
  }
}

/**
 * Daily automatic transition (`orgs.lifecycle`): TRIAL past `trialEndsAt` → PAST_DUE, and PAST_DUE
 * for more than 14 days → SUSPENDED. Returns null when nothing changes. Pure, so tests use a fake clock.
 */
export function nextLifecycleTransition(org: LifecycleFields, now: Date): LifecyclePatch | null {
  if (org.status === "TRIAL" && org.trialEndsAt !== null && org.trialEndsAt !== undefined && org.trialEndsAt.getTime() <= now.getTime()) {
    return statusPatch("PAST_DUE", now, { current: org });
  }
  if (org.status === "PAST_DUE") {
    const since = org.pastDueAt ?? null;
    if (since === null) return { status: "PAST_DUE", pastDueAt: now };
    if (now.getTime() - since.getTime() >= PAST_DUE_GRACE_DAYS * DAY_MS) return statusPatch("SUSPENDED", now, { current: org });
  }
  return null;
}

function iso(value: Date | null | undefined): string | null {
  return value === null || value === undefined ? null : value.toISOString();
}

export function orgStatusDto(org: LifecycleFields & Pick<Organization, "plan">): OrgStatusDTO {
  return {
    status: org.status,
    plan: org.plan,
    trialEndsAt: iso(org.trialEndsAt),
    pastDueAt: iso(org.pastDueAt),
    suspendedAt: iso(org.suspendedAt),
    cancelledAt: iso(org.cancelledAt),
    purgeAfter: iso(org.purgeAfter),
  };
}

/** Realtime `org:status` payload: only the dates that are set. */
export function orgStatusEvent(org: LifecycleFields): OrgStatusEventData {
  const data: { -readonly [K in keyof OrgStatusEventData]: OrgStatusEventData[K] } = { status: org.status };
  for (const key of ["trialEndsAt", "pastDueAt", "suspendedAt", "cancelledAt", "purgeAfter"] as const) {
    const value = org[key];
    if (value !== null && value !== undefined) data[key] = value.toISOString();
  }
  return data;
}
