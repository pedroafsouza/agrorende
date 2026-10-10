import type { Metadata } from "next";

import { PageFrame, SiteDocument } from "@/components/SiteDocument";
import { DEFAULT_SITE_LOCALE } from "@/lib/locales";
import { buildMetadata } from "@/lib/metadata";
import { NotFoundView } from "@/views/Recovery";

const route = { kind: "page", key: "notFound" } as const;

export const metadata: Metadata = buildMetadata(route, DEFAULT_SITE_LOCALE);

/** Fallback 404 for paths outside every locale. Caddy serves the localized copy where it can. */
export default function RootNotFound() {
  return (
    <SiteDocument locale={DEFAULT_SITE_LOCALE}>
      <PageFrame locale={DEFAULT_SITE_LOCALE} route={route}>
        <NotFoundView locale={DEFAULT_SITE_LOCALE} />
      </PageFrame>
    </SiteDocument>
  );
}
