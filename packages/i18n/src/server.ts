import enExports from "../locales/en/exports.json";
import enNotifications from "../locales/en/notifications.json";
import ptBRExports from "../locales/pt-BR/exports.json";
import ptBRNotifications from "../locales/pt-BR/notifications.json";
import { resolveLocale, type SupportedLocale } from "./locales.js";

/**
 * Server-side message catalogues (ARCHITECTURE §20). Core renders notification texts and CSV
 * export headers from these namespaces, so translators edit only the locale JSON files.
 */
export const SERVER_MESSAGES = {
  "pt-BR": { notifications: ptBRNotifications, exports: ptBRExports },
  en: { notifications: enNotifications, exports: enExports },
} as const satisfies Record<SupportedLocale, Record<string, unknown>>;

export type ServerNamespace = keyof (typeof SERVER_MESSAGES)["pt-BR"];

export type IcuParams = Readonly<Record<string, string | number>>;

/** Resolves a stored user or organisation locale, falling back to pt-BR for unknown tags. */
export function resolveServerLocale(locale: string | null | undefined): SupportedLocale {
  return resolveLocale(locale === null || locale === undefined ? [] : [locale]);
}

function lookup(value: unknown, path: readonly string[]): string | undefined {
  let current: unknown = value;
  for (const segment of path) {
    if (typeof current !== "object" || current === null || !Object.hasOwn(current, segment)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" ? current : undefined;
}

/** Returns the raw ICU message at `key` (dot separated) in `namespace`, or undefined when absent. */
export function serverMessage(locale: SupportedLocale, namespace: ServerNamespace, key: string): string | undefined {
  return lookup(SERVER_MESSAGES[locale][namespace], key.split("."));
}

function pluralBlock(source: string, start: number): { readonly end: number; readonly options: Record<string, string> } {
  const options: Record<string, string> = {};
  let index = start;
  while (index < source.length) {
    while (source[index] === " ") index += 1;
    if (source[index] === "}") return { end: index, options };
    let key = "";
    while (index < source.length && source[index] !== "{" && source[index] !== " ") {
      key += source[index];
      index += 1;
    }
    while (source[index] === " ") index += 1;
    let depth = 0;
    let value = "";
    for (; index < source.length; index += 1) {
      const char = source[index];
      if (char === "{") {
        depth += 1;
        if (depth === 1) continue;
      }
      if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          index += 1;
          break;
        }
      }
      value += char;
    }
    options[key] = value;
  }
  return { end: index, options };
}

/**
 * Renders the ICU subset used by server messages: `{name}` arguments and
 * `{n, plural, =0 {…} one {…} other {…}}` with `#`. Missing arguments render as empty text.
 */
export function renderIcu(template: string, params: IcuParams, locale: SupportedLocale): string {
  let output = "";
  let index = 0;
  while (index < template.length) {
    const char = template[index];
    if (char !== "{") {
      output += char;
      index += 1;
      continue;
    }
    const close = template.indexOf("}", index);
    const head = template.slice(index + 1, close === -1 ? template.length : close);
    const pluralMatch = /^\s*(\w+)\s*,\s*plural\s*,/.exec(head);
    if (pluralMatch !== null) {
      const name = pluralMatch[1] ?? "";
      const block = pluralBlock(template, index + 1 + pluralMatch[0].length);
      const count = Number(params[name] ?? 0);
      const category = new Intl.PluralRules(locale).select(count);
      const exact = block.options[`=${count}`];
      const chosen = exact ?? block.options[category] ?? block.options.other ?? "";
      output += renderIcu(chosen.replaceAll("#", String(count)), params, locale);
      index = block.end + 1;
      continue;
    }
    const key = head.trim();
    const value = params[key];
    output += value === undefined ? "" : String(value);
    index = close === -1 ? template.length : close + 1;
  }
  return output.replace(/\s{2,}/g, " ").trim();
}

/** Looks up `namespace.key` for `locale` and renders it; returns undefined when the key is absent. */
export function formatServerMessage(locale: SupportedLocale, namespace: ServerNamespace, key: string, params: IcuParams = {}): string | undefined {
  const template = serverMessage(locale, namespace, key);
  return template === undefined ? undefined : renderIcu(template, params, locale);
}
