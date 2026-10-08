import { DEFAULT_LOCALE, PSEUDO_LOCALE, SUPPORTED_LOCALES, type SupportedLocale } from "@agrorende/i18n";
import i18next, { type Resource, type ResourceLanguage } from "i18next";
import ICU from "i18next-icu";
import { createStore } from "zustand/vanilla";

import { pseudoTree } from "./pseudo";
import { resources as bundled } from "./resources";

export type AppLocale = SupportedLocale | typeof PSEUDO_LOCALE;

export const localeStore = createStore<{ locale: AppLocale }>()(() => ({ locale: DEFAULT_LOCALE }));

const instance = i18next.createInstance();
const namespaces = new Set<string>(Object.keys(bundled.en ?? {}));
let initialised = false;

function buildResources(): Resource {
  const out: Resource = {};
  for (const locale of SUPPORTED_LOCALES) out[locale] = (bundled[locale] ?? {}) as ResourceLanguage;
  out[PSEUDO_LOCALE] = pseudoTree(bundled.en ?? {}) as ResourceLanguage;
  return out;
}

export function initI18n(locale: AppLocale = DEFAULT_LOCALE): void {
  if (!initialised) {
    initialised = true;
    void instance.use(ICU).init({
      initImmediate: false,
      resources: buildResources(),
      lng: locale,
      fallbackLng: { [PSEUDO_LOCALE]: ["en"], default: [DEFAULT_LOCALE] },
      ns: [...namespaces],
      defaultNS: "common",
      interpolation: { escapeValue: false },
      returnNull: false,
      showSupportNotice: false,
    } as Parameters<typeof instance.init>[0]);
  } else {
    void instance.changeLanguage(locale);
  }
  localeStore.setState({ locale });
}

/** Switches language offline and immediately; the caller persists it and PATCHes `/me` when online. */
export function setLocale(locale: AppLocale): void {
  initI18n(locale);
}

export function currentLocale(): AppLocale {
  return localeStore.getState().locale;
}

/**
 * Feature folders register their own namespace (e.g. `reports`) at module load, so this file never
 * imports another owner's JSON (DELIVERY-PLAN R2).
 */
export function registerNamespace(namespace: string, bundles: Partial<Record<SupportedLocale, object>>): void {
  if (!initialised) initI18n(localeStore.getState().locale);
  namespaces.add(namespace);
  for (const locale of SUPPORTED_LOCALES) {
    const bundle = bundles[locale];
    if (bundle !== undefined) instance.addResourceBundle(locale, namespace, bundle, true, true);
  }
  if (bundles.en !== undefined) instance.addResourceBundle(PSEUDO_LOCALE, namespace, pseudoTree(bundles.en) as object, true, true);
}

export function splitKey(key: string): { readonly ns: string; readonly path: string } {
  const dot = key.indexOf(".");
  if (dot > 0) {
    const head = key.slice(0, dot);
    if (namespaces.has(head)) return { ns: head, path: key.slice(dot + 1) };
  }
  return { ns: "common", path: key };
}

export function hasMessage(key: string): boolean {
  if (!initialised) initI18n(localeStore.getState().locale);
  const { ns, path } = splitKey(key);
  return instance.exists(path, { ns });
}

/** Missing keys render the key itself so gaps are visible in review and caught by the parity test. */
export function translate(key: string, values?: Readonly<Record<string, unknown>>): string {
  if (!initialised) initI18n(localeStore.getState().locale);
  const { ns, path } = splitKey(key);
  if (!instance.exists(path, { ns })) return key;
  const result = instance.t(path, { ns, ...(values ?? {}) } as Record<string, unknown>);
  return typeof result === "string" ? result : key;
}
