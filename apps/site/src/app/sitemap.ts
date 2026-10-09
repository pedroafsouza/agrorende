import type { MetadataRoute } from "next";

import { SITE_LOCALES } from "@/lib/locales";
import { absoluteUrl, alternatesFor } from "@/lib/metadata";
import { allRoutes, isIndexable, pathFor } from "@/lib/routes";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return allRoutes()
    .filter(isIndexable)
    .flatMap((route) =>
      SITE_LOCALES.map((locale) => ({
        url: absoluteUrl(pathFor(route, locale)),
        alternates: { languages: alternatesFor(route) },
        changeFrequency: route.kind === "page" && route.key === "home" ? ("weekly" as const) : ("monthly" as const),
        priority: route.kind === "page" && route.key === "home" ? 1 : route.kind === "page" ? 0.7 : 0.4,
      })),
    );
}
