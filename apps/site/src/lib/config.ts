/**
 * Build-time configuration for the static site. Every value is read once when `next build` runs,
 * so the exported HTML contains only public URLs and contact details, never secrets.
 */
export interface SiteConfig {
  readonly siteUrl: string;
  readonly appUrl: string;
  readonly showPrices: boolean;
  readonly whatsappNumber: string;
  readonly contactEmail: string;
  readonly privacyEmail: string;
  readonly appStoreUrl: string | undefined;
  readonly playStoreUrl: string | undefined;
  readonly termsVersion: string;
}

type Env = Readonly<Record<string, string | undefined>>;

function trimSlash(value: string): string {
  return value.replace(/\/+$/u, "");
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function httpUrl(value: string | undefined): string | undefined {
  const candidate = nonEmpty(value);
  if (candidate === undefined) return undefined;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? trimSlash(url.toString()) : undefined;
  } catch {
    return undefined;
  }
}

export function readSiteConfig(env: Env): SiteConfig {
  return {
    siteUrl: httpUrl(env.SITE_URL) ?? "https://agrorende.com.br",
    appUrl: httpUrl(env.APP_URL) ?? "https://app.agrorende.com.br",
    showPrices: env.SITE_SHOW_PRICES?.trim().toLowerCase() === "true",
    whatsappNumber: nonEmpty(env.SITE_WHATSAPP) ?? nonEmpty(env.PLATFORM_SUPPORT_WHATSAPP) ?? "+5511999999999",
    contactEmail: nonEmpty(env.SITE_CONTACT_EMAIL) ?? "contato@agrorende.com.br",
    privacyEmail: nonEmpty(env.SITE_PRIVACY_EMAIL) ?? "privacidade@agrorende.com.br",
    appStoreUrl: httpUrl(env.SITE_APP_STORE_URL),
    playStoreUrl: httpUrl(env.SITE_PLAY_STORE_URL),
    termsVersion: nonEmpty(env.TERMS_VERSION) ?? "2026-10-08",
  };
}

export const siteConfig: SiteConfig = readSiteConfig(process.env);

/** `wa.me` expects the number as digits only, without `+`, spaces or punctuation. */
export function whatsappHref(number: string, text: string): string {
  const digits = number.replace(/\D/gu, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function mailtoHref(email: string, subject: string, body?: string): string {
  const params = [`subject=${encodeURIComponent(subject)}`];
  if (body !== undefined) params.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${email}?${params.join("&")}`;
}

/** Shows the public number in a readable Brazilian format when it is a Brazilian E.164 number. */
export function displayPhone(number: string): string {
  const digits = number.replace(/\D/gu, "");
  const match = /^55(\d{2})(\d{4,5})(\d{4})$/u.exec(digits);
  if (match === null) return number;
  return `+55 ${match[1]} ${match[2]}-${match[3]}`;
}
