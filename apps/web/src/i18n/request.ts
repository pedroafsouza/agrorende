import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { DEFAULT_LOCALE, resolveLocale, type SupportedLocale } from "@agrorende/i18n/locales";

export function resolveWebLocale(candidates: readonly string[]): SupportedLocale {
  return resolveLocale([...candidates, DEFAULT_LOCALE]);
}

// Server components such as the environment ribbon translate through this config, so it carries every
// namespace that the client providers carry.
const SERVER_NAMESPACES = [
  "admin", "analytics", "assets", "attention", "auth", "billing", "comments", "common", "costs", "errors", "fuel",
  "jobs", "maintenance", "ops", "parts", "platform", "rentals", "reports", "settings", "signup", "subscription",
  "sync", "team", "templates", "tenancy", "web",
] as const;

async function loadServerMessages(locale: SupportedLocale): Promise<Record<string, unknown>> {
  const entries = await Promise.all(
    SERVER_NAMESPACES.map(async (namespace) => {
      const messages = (await import(`../../messages/${locale}/${namespace}.json`)).default as Record<string, unknown>;
      return [namespace, messages] as const;
    }),
  );
  return Object.fromEntries(entries);
}

// The admin app has no locale segment, so resolve the locale exactly like the root layout does:
// the `NEXT_LOCALE` cookie, then `Accept-Language`, then pt-BR.
export default getRequestConfig(async ({ requestLocale }) => {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const locale = resolveWebLocale([
    (await requestLocale) ?? "",
    cookieStore.get("NEXT_LOCALE")?.value ?? "",
    headerStore.get("accept-language") ?? "",
  ]);
  return {
    locale,
    messages: await loadServerMessages(locale),
  };
});
