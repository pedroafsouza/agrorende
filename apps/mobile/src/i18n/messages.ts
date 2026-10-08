import { DEFAULT_LOCALE, type SupportedLocale, resolveLocale } from "@agrorende/i18n";

import { translate } from "./runtime";

/** Any `namespace.key` string; unknown first segments resolve inside `common` (e.g. `routes.*`, `ui.*`). */
export type MessageKey = string;

export type MessageValues = Readonly<Record<string, string | number | boolean | Date | null | undefined>>;

export function resolveMobileLocale(candidates: readonly string[], organizationDefault = DEFAULT_LOCALE): SupportedLocale {
  return resolveLocale([...candidates, organizationDefault]);
}

/** Non-React translation; components should prefer `useT()` so they re-render on a language switch. */
export function message(key: MessageKey, values?: MessageValues): string {
  return translate(key, values);
}
