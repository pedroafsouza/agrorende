import enErrors from "@agrorende/i18n/locales/en/errors.json";
import ptErrors from "@agrorende/i18n/locales/pt-BR/errors.json";
import { createTranslator } from "next-intl";

import enSite from "../../messages/en/site.json";
import ptSite from "../../messages/pt-BR/site.json";
import { appLocale, type SiteLocale } from "../lib/locales";

export type SiteMessages = typeof ptSite;

export const SITE_MESSAGES: Record<SiteLocale, SiteMessages> = { "pt-br": ptSite, en: enSite };

export function getTranslator(locale: SiteLocale) {
  return createTranslator({ locale: appLocale(locale), messages: SITE_MESSAGES[locale] });
}

export type Translator = ReturnType<typeof getTranslator>;

/** Messages store short lists as one string separated by `|`, so both locales keep the same key set. */
export function splitList(value: string): string[] {
  return value
    .split("|")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export interface ErrorCopy {
  readonly title: string;
  readonly body: string;
  readonly action: string;
  /** Optional longer explanation (ARCHITECTURE §22.1); shown under "More details" when present. */
  readonly help?: string;
}

type ErrorCatalog = Record<string, { title: string; body: string; action: string; help?: string }>;

const ERROR_COPY: Record<SiteLocale, ErrorCatalog> = { "pt-br": ptErrors, en: enErrors };

/**
 * The shared `errors` catalogue (packages/i18n) is the single source of error copy. Help pages
 * show it without runtime values, so ICU arguments such as `{email}` become a neutral phrase.
 */
export function errorCopy(locale: SiteLocale, code: string): ErrorCopy | undefined {
  const entry = ERROR_COPY[locale][code];
  if (entry === undefined) return undefined;
  const placeholders: Record<string, string> = SITE_MESSAGES[locale].helpError.placeholders;
  const fill = (text: string): string => text.replace(/\{(\w+)\}/gu, (_match, name: string) => placeholders[name] ?? "…");
  const copy = { title: fill(entry.title), body: fill(entry.body), action: fill(entry.action) };
  return entry.help === undefined ? copy : { ...copy, help: fill(entry.help) };
}
