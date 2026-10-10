import { ALL_ERROR_CODES, type AppErrorCode } from "@agrorende/contracts/errors";

import { SITE_LOCALES, type SiteLocale } from "./locales";

/** Every static page of the site. `helpError` is expanded once per error code. */
export const PAGE_KEYS = [
  "home",
  "features",
  "pricing",
  "help",
  "helpUnknown",
  "privacy",
  "terms",
  "dpa",
  "deleteAccount",
  "notFound",
] as const;
export type PageKey = (typeof PAGE_KEYS)[number];

/** Localized pathnames without the locale prefix. The legal slugs match `apps/web/src/features/signup/legal.ts`. */
export const PAGE_SLUGS: Record<PageKey, Record<SiteLocale, readonly string[]>> = {
  home: { "pt-br": [], en: [] },
  features: { "pt-br": ["recursos"], en: ["features"] },
  pricing: { "pt-br": ["planos"], en: ["pricing"] },
  help: { "pt-br": ["ajuda"], en: ["help"] },
  helpUnknown: { "pt-br": ["ajuda", "erros", "codigo-desconhecido"], en: ["help", "errors", "unknown-code"] },
  privacy: { "pt-br": ["privacidade"], en: ["privacy"] },
  terms: { "pt-br": ["termos"], en: ["terms"] },
  dpa: { "pt-br": ["dpa"], en: ["dpa"] },
  deleteAccount: { "pt-br": ["excluir-conta"], en: ["delete-account"] },
  notFound: { "pt-br": ["404"], en: ["404"] },
};

export const HELP_ERRORS_BASE: Record<SiteLocale, readonly string[]> = {
  "pt-br": ["ajuda", "erros"],
  en: ["help", "errors"],
};

/** Pages that are not indexed and not listed in the sitemap. */
export const NOINDEX_PAGES: ReadonlySet<PageKey> = new Set<PageKey>(["notFound", "helpUnknown"]);

export type SiteRoute =
  | { readonly kind: "page"; readonly key: PageKey }
  | { readonly kind: "helpError"; readonly code: AppErrorCode };

export function codeToSlug(code: string): string {
  return code.trim().toLowerCase().replace(/_/gu, "-");
}

const CODE_BY_SLUG = new Map<string, AppErrorCode>(ALL_ERROR_CODES.map((code) => [codeToSlug(code), code]));

export function codeFromSlug(slug: string): AppErrorCode | undefined {
  return CODE_BY_SLUG.get(codeToSlug(slug));
}

function join(locale: SiteLocale, segments: readonly string[]): string {
  return segments.length === 0 ? `/${locale}/` : `/${locale}/${segments.join("/")}/`;
}

export function routeSegments(route: SiteRoute, locale: SiteLocale): readonly string[] {
  return route.kind === "page" ? PAGE_SLUGS[route.key][locale] : [...HELP_ERRORS_BASE[locale], codeToSlug(route.code)];
}

/** Absolute path (with trailing slash, as exported) of a route in a locale. */
export function pathFor(route: SiteRoute, locale: SiteLocale): string {
  return join(locale, routeSegments(route, locale));
}

export function pagePath(key: PageKey, locale: SiteLocale): string {
  return pathFor({ kind: "page", key }, locale);
}

/** `/pt-br/ajuda/erros/` and `/en/help/errors/`: the prefix every error-code page shares. */
export function helpErrorBase(locale: SiteLocale): string {
  return join(locale, HELP_ERRORS_BASE[locale]);
}

export function helpErrorPath(code: AppErrorCode, locale: SiteLocale): string {
  return pathFor({ kind: "helpError", code }, locale);
}

/** Resolves the slug segments of `/[locale]/[[...slug]]` to a route, or `undefined` for unknown paths. */
export function resolveRoute(locale: SiteLocale, slug: readonly string[]): SiteRoute | undefined {
  const joined = slug.join("/");
  for (const key of PAGE_KEYS) {
    if (PAGE_SLUGS[key][locale].join("/") === joined) return { kind: "page", key };
  }
  const base = HELP_ERRORS_BASE[locale];
  if (slug.length === base.length + 1 && base.every((segment, index) => slug[index] === segment)) {
    const last = slug[slug.length - 1];
    const code = last === undefined ? undefined : CODE_BY_SLUG.get(last);
    if (code !== undefined) return { kind: "helpError", code };
  }
  return undefined;
}

export function allRoutes(): readonly SiteRoute[] {
  return [
    ...PAGE_KEYS.map((key): SiteRoute => ({ kind: "page", key })),
    ...ALL_ERROR_CODES.map((code): SiteRoute => ({ kind: "helpError", code })),
  ];
}

export function isIndexable(route: SiteRoute): boolean {
  return route.kind === "helpError" || !NOINDEX_PAGES.has(route.key);
}

export function staticParams(): { locale: SiteLocale; slug: string[] }[] {
  return SITE_LOCALES.flatMap((locale) => allRoutes().map((route) => ({ locale, slug: [...routeSegments(route, locale)] })));
}
