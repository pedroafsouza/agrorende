import type { OrgStatus } from "@agrorende/contracts/enums";

const DAY_MS = 24 * 60 * 60 * 1000;
export const TRIAL_DAYS = 30;
export const GRACE_DAYS = 14;
export const EXPORT_DAYS = 90;

export interface StatusWindow {
  readonly kind: "trial" | "grace" | "export";
  readonly endsAt: string;
  readonly daysLeft: number;
  readonly totalDays: number;
}

interface WindowInput {
  readonly status: OrgStatus;
  readonly trialEndsAt: string | null;
  readonly pastDueAt: string | null;
  readonly purgeAfter: string | null;
}

function makeWindow(kind: StatusWindow["kind"], endsAt: string | null, totalDays: number, now: Date): StatusWindow | null {
  if (endsAt === null) return null;
  const at = Date.parse(endsAt);
  if (Number.isNaN(at)) return null;
  const daysLeft = Math.max(0, Math.ceil((at - now.getTime()) / DAY_MS));
  return { kind, endsAt: new Date(at).toISOString(), daysLeft: Math.min(daysLeft, totalDays), totalDays };
}

/** The countdown that matters for the current status: trial end, PAST_DUE grace end or the export deadline. */
export function statusWindow(input: WindowInput, now: Date): StatusWindow | null {
  if (input.status === "TRIAL") return makeWindow("trial", input.trialEndsAt, TRIAL_DAYS, now);
  if (input.status === "PAST_DUE") {
    const start = input.pastDueAt === null ? Number.NaN : Date.parse(input.pastDueAt);
    return Number.isNaN(start) ? null : makeWindow("grace", new Date(start + GRACE_DAYS * DAY_MS).toISOString(), GRACE_DAYS, now);
  }
  if (input.status === "CANCELLED") return makeWindow("export", input.purgeAfter, EXPORT_DAYS, now);
  return null;
}

/** Bytes as KB/MB/GB with the locale's digits. */
export function formatBytes(bytes: number, locale: string): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: unit === 0 ? 0 : 1 }).format(value)} ${units[unit]}`;
}
