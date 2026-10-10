import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageFrame } from "@/components/SiteDocument";
import { isSiteLocale, type SiteLocale } from "@/lib/locales";
import { buildMetadata } from "@/lib/metadata";
import { resolveRoute, staticParams, type SiteRoute } from "@/lib/routes";
import { DeleteAccountView } from "@/views/DeleteAccount";
import { FeaturesView } from "@/views/Features";
import { HelpView } from "@/views/Help";
import { HelpErrorView } from "@/views/HelpError";
import { HomeView } from "@/views/Home";
import { LegalView } from "@/views/Legal";
import { PricingView } from "@/views/Pricing";
import { HelpUnknownView, NotFoundView } from "@/views/Recovery";

export const dynamic = "force-static";
export const dynamicParams = false;

type Params = Promise<{ locale: string; slug?: string[] }>;

export function generateStaticParams() {
  return staticParams();
}

async function resolve(params: Params): Promise<{ locale: SiteLocale; route: SiteRoute }> {
  const { locale, slug } = await params;
  if (!isSiteLocale(locale)) notFound();
  const route = resolveRoute(locale, (slug ?? []).map((segment) => decodeURIComponent(segment)));
  if (route === undefined) notFound();
  return { locale, route };
}

export async function generateMetadata({ params }: { readonly params: Params }): Promise<Metadata> {
  const { locale, route } = await resolve(params);
  return buildMetadata(route, locale);
}

function View({ locale, route }: { readonly locale: SiteLocale; readonly route: SiteRoute }) {
  if (route.kind === "helpError") return <HelpErrorView locale={locale} code={route.code} />;
  switch (route.key) {
    case "home":
      return <HomeView locale={locale} />;
    case "features":
      return <FeaturesView locale={locale} />;
    case "pricing":
      return <PricingView locale={locale} />;
    case "help":
      return <HelpView locale={locale} />;
    case "helpUnknown":
      return <HelpUnknownView locale={locale} />;
    case "privacy":
    case "terms":
    case "dpa":
      return <LegalView locale={locale} document={route.key} />;
    case "deleteAccount":
      return <DeleteAccountView locale={locale} />;
    case "notFound":
      return <NotFoundView locale={locale} />;
  }
}

export default async function SitePage({ params }: { readonly params: Params }) {
  const { locale, route } = await resolve(params);
  return (
    <PageFrame locale={locale} route={route}>
      <View locale={locale} route={route} />
    </PageFrame>
  );
}
