import { useCallback, useSyncExternalStore } from "react";

import type { MessageKey, MessageValues } from "./messages";
import { localeStore, translate, type AppLocale } from "./runtime";

export function useLocale(): AppLocale {
  return useSyncExternalStore(localeStore.subscribe, () => localeStore.getState().locale);
}

/** Translation hook; re-renders every subscriber on a language switch. */
export function useT(): (key: MessageKey, values?: MessageValues) => string {
  const locale = useLocale();
  return useCallback((key: MessageKey, values?: MessageValues) => translate(key, values), [locale]);
}
