import { getRequestConfig } from "next-intl/server";

import { DEFAULT_LOCALE, resolveLocale, type SupportedLocale } from "@agrorende/i18n/locales";

export function resolveWebLocale(candidates: readonly string[]): SupportedLocale {
  return resolveLocale([...candidates, DEFAULT_LOCALE]);
}

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = resolveWebLocale([(await requestLocale) ?? DEFAULT_LOCALE]);
  const web = (await import(`../../messages/${locale}/web.json`)).default as Record<string, unknown>;

  return {
    locale,
    messages: { web },
  };
});
