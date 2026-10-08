/** Tenancy configuration (ARCHITECTURE §5.3, §11 and the environment table). */
export interface TenancyConfig {
  readonly trialDays: number;
  readonly termsVersion: string;
  readonly platformAdminEmails: readonly string[];
  readonly supportWhatsApp: string | null;
  readonly google: {
    readonly clientId: string;
    readonly clientSecret: string;
    readonly issuer: string;
  };
}

/** PAST_DUE organisations become SUSPENDED after this grace period. */
export const PAST_DUE_GRACE_DAYS = 14;
/** Cancelled organisations keep their data this long for export, then `orgs.purge` deletes it. */
export const PURGE_AFTER_DAYS = 90;
/** Sign-up tickets are short-lived and bound to one Google or Apple identity. */
export const SIGNUP_TICKET_TTL_S = 15 * 60;
/** One-time code that hands a freshly created mobile sign-up back to the app. */
export const SIGNUP_LOGIN_CODE_TTL_S = 2 * 60;
/** Staff console session (`ar_platform`, ARCHITECTURE §11). */
export const PLATFORM_SESSION_TTL_S = 8 * 60 * 60;
export const PLATFORM_COOKIE = "ar_platform";
export const PLATFORM_OAUTH_COOKIE = "ar_platform_oauth";
export const PLATFORM_AUDIENCE = "platform";
export const SIGNUP_RATE_LIMITS = {
  ip: { name: "signup-ip", limit: 5, windowMs: 24 * 60 * 60 * 1000 },
  identity: { name: "signup-identity", limit: 3, windowMs: 24 * 60 * 60 * 1000 },
} as const;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const SEQUENCE_KEYS = ["FR", "WO", "RN", "BD", "AGR"] as const;

let override: Partial<TenancyConfig> | null = null;

/** Test seam: replaces selected configuration values until reset with `null`. */
export function setTenancyConfigForTests(value: Partial<TenancyConfig> | null): void {
  override = value;
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function tenancyConfig(env: NodeJS.ProcessEnv = process.env): TenancyConfig {
  const emails = (env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
  const whatsapp = env.PLATFORM_SUPPORT_WHATSAPP?.trim();
  return {
    trialDays: override?.trialDays ?? positiveInt(env.TRIAL_DAYS, 30),
    termsVersion: override?.termsVersion ?? env.TERMS_VERSION ?? "2026-10-08",
    platformAdminEmails: override?.platformAdminEmails ?? emails,
    supportWhatsApp: override?.supportWhatsApp === undefined ? (whatsapp === undefined || whatsapp.length === 0 ? null : whatsapp) : override.supportWhatsApp,
    google: override?.google ?? {
      clientId: env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
      issuer: env.GOOGLE_OIDC_ISSUER ?? "https://accounts.google.com",
    },
  };
}
