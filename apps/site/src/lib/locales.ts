import { type SupportedLocale } from "@agrorende/i18n/locales";

/** URL prefixes of the public site (ARCHITECTURE §22.1). Lower case, one per supported app locale. */
export const SITE_LOCALES = ["pt-br", "en"] as const;
export type SiteLocale = (typeof SITE_LOCALES)[number];
export const DEFAULT_SITE_LOCALE: SiteLocale = "pt-br";

const APP_LOCALE: Record<SiteLocale, SupportedLocale> = { "pt-br": "pt-BR", en: "en" };
const HTML_LANG: Record<SiteLocale, string> = { "pt-br": "pt-BR", en: "en" };
const OG_LOCALE: Record<SiteLocale, string> = { "pt-br": "pt_BR", en: "en_US" };

export function isSiteLocale(value: string): value is SiteLocale {
  return (SITE_LOCALES as readonly string[]).includes(value);
}

export function appLocale(locale: SiteLocale): SupportedLocale {
  return APP_LOCALE[locale];
}

export function htmlLang(locale: SiteLocale): string {
  return HTML_LANG[locale];
}

export function ogLocale(locale: SiteLocale): string {
  return OG_LOCALE[locale];
}

export function otherLocale(locale: SiteLocale): SiteLocale {
  return locale === "en" ? "pt-br" : "en";
}

/** Mirrors the Caddy rule for `/`: any `en*` language goes to English, everything else to pt-BR. */
export function localeFromAcceptLanguage(header: string | undefined): SiteLocale {
  const first = header?.split(",")[0]?.trim().toLowerCase() ?? "";
  return first.startsWith("en") ? "en" : "pt-br";
}
