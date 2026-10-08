import "server-only";

import { cookies, headers } from "next/headers";

import { DEFAULT_LOCALE, resolveLocale, type SupportedLocale } from "@agrorende/i18n/locales";

/** Namespaces the T04 shell, auth and master-data screens read on the client. */
export const SHELL_NAMESPACES = ["web", "errors", "common", "auth", "admin", "assets", "settings", "team", "templates", "tenancy"] as const;
export type ShellNamespace = (typeof SHELL_NAMESPACES)[number];
export type Messages = Record<string, unknown>;

export async function getRequestLocale(): Promise<SupportedLocale> {
  const cookieStore = await cookies();
  const headerStore = await headers();
  return resolveLocale([cookieStore.get("NEXT_LOCALE")?.value ?? "", headerStore.get("accept-language") ?? "", DEFAULT_LOCALE]);
}

async function loadNamespace(locale: SupportedLocale, namespace: string): Promise<Messages> {
  try {
    return (await import(`../../messages/${locale}/${namespace}.json`)).default as Messages;
  } catch {
    return {};
  }
}

/** Loads the requested namespaces, falling back key-by-key to pt-BR (the source locale). */
export async function loadMessages(locale: SupportedLocale, namespaces: readonly string[] = SHELL_NAMESPACES): Promise<Messages> {
  const out: Messages = {};
  for (const namespace of namespaces) {
    const primary = await loadNamespace(locale, namespace);
    out[namespace] = locale === DEFAULT_LOCALE ? primary : deepMerge(await loadNamespace(DEFAULT_LOCALE, namespace), primary);
  }
  return out;
}

function deepMerge(base: Messages, over: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(over)) {
    const prev = out[key];
    out[key] =
      typeof value === "object" && value !== null && typeof prev === "object" && prev !== null
        ? deepMerge(prev as Messages, value as Messages)
        : value;
  }
  return out;
}
