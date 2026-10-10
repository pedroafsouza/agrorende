import type { Metadata } from "next";

import { errorCopy, getTranslator } from "../i18n/messages";
import { siteConfig } from "./config";
import { htmlLang, ogLocale, otherLocale, SITE_LOCALES, type SiteLocale } from "./locales";
import { isIndexable, pathFor, type SiteRoute } from "./routes";

export function absoluteUrl(path: string): string {
  return `${siteConfig.siteUrl}${path}`;
}

/** hreflang alternates for both locales plus `x-default`, which points to the Portuguese page. */
export function alternatesFor(route: SiteRoute): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of SITE_LOCALES) languages[htmlLang(locale)] = absoluteUrl(pathFor(route, locale));
  languages["x-default"] = absoluteUrl(pathFor(route, "pt-br"));
  return languages;
}

export function titleAndDescription(route: SiteRoute, locale: SiteLocale): { title: string; description: string } {
  const t = getTranslator(locale);
  if (route.kind === "helpError") {
    const copy = errorCopy(locale, route.code);
    const values = { code: route.code, title: copy?.title ?? route.code, body: copy?.body ?? "" };
    return { title: t("meta.helpError.title", values), description: t("meta.helpError.description", values) };
  }
  return { title: t(`meta.${route.key}.title`), description: t(`meta.${route.key}.description`) };
}

export function buildMetadata(route: SiteRoute, locale: SiteLocale): Metadata {
  const t = getTranslator(locale);
  const { title, description } = titleAndDescription(route, locale);
  const url = absoluteUrl(pathFor(route, locale));
  const indexable = isIndexable(route);
  const image = { url: `/og/${locale}.png`, width: 1200, height: 630, alt: t("meta.tagline") };
  return {
    metadataBase: new URL(siteConfig.siteUrl),
    title,
    description,
    applicationName: t("meta.siteName"),
    alternates: indexable ? { canonical: url, languages: alternatesFor(route) } : undefined,
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      type: "website",
      siteName: t("meta.siteName"),
      title,
      description,
      url,
      locale: ogLocale(locale),
      alternateLocale: [ogLocale(otherLocale(locale))],
      images: [image],
    },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
    icons: {
      icon: [
        { url: "/icon.svg", type: "image/svg+xml" },
        { url: "/favicon.ico", sizes: "32x32" },
      ],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    },
    formatDetection: { telephone: false, email: false, address: false },
  };
}
