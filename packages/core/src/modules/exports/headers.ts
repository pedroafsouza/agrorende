import { SERVER_MESSAGES } from "@agrorende/i18n/server";

import { EXPORT_LOCALES, type ExportLocale } from "./dto.js";

type Label = Readonly<Record<ExportLocale, string>>;

export type ExportHeaderKey = keyof (typeof SERVER_MESSAGES)["pt-BR"]["exports"]["headers"];

const HEADER_KEYS = Object.keys(SERVER_MESSAGES["pt-BR"].exports.headers) as ExportHeaderKey[];

/**
 * Localized CSV column headers, read from the `exports.headers` namespace of `@agrorende/i18n`
 * (change request T05-010).
 */
export const EXPORT_HEADERS: Readonly<Record<ExportHeaderKey, Label>> = Object.fromEntries(
  HEADER_KEYS.map((key) => [key, Object.fromEntries(EXPORT_LOCALES.map((locale) => [locale, SERVER_MESSAGES[locale].exports.headers[key]]))]),
) as Record<ExportHeaderKey, Label>;

/** Localized boolean cell values, read from `exports.boolean.{true,false}`. */
export const BOOLEAN_LABELS: Readonly<Record<ExportLocale, { readonly yes: string; readonly no: string }>> = Object.fromEntries(
  EXPORT_LOCALES.map((locale) => [locale, { yes: SERVER_MESSAGES[locale].exports.boolean.true, no: SERVER_MESSAGES[locale].exports.boolean.false }]),
) as Record<ExportLocale, { yes: string; no: string }>;
