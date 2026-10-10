import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { SiteDocument } from "@/components/SiteDocument";
import { isSiteLocale, SITE_LOCALES } from "@/lib/locales";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return SITE_LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  readonly children: ReactNode;
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSiteLocale(locale)) notFound();
  return <SiteDocument locale={locale}>{children}</SiteDocument>;
}
