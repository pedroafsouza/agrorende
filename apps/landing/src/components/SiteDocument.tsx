import { type ReactNode } from "react";

import { geistMono, geistSans } from "@/fonts/fonts";
import { bodyScript, headScript } from "@/lib/inlineScripts";
import { htmlLang, type SiteLocale } from "@/lib/locales";
import { type SiteRoute } from "@/lib/routes";
import { getTranslator } from "@/i18n/messages";

import { Footer } from "./Footer";
import { Header } from "./Header";
import { LiteNotice, LocaleBanner, NoScriptNote } from "./Notices";

/** The whole HTML document. Shared by the locale layout and the root not-found page. */
export function SiteDocument({ locale, children }: { readonly locale: SiteLocale; readonly children: ReactNode }) {
  return (
    <html lang={htmlLang(locale)} className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#ffffff" />
        <script dangerouslySetInnerHTML={{ __html: headScript() }} />
      </head>
      <body className="flex min-h-dvh flex-col bg-bg font-sans text-fg antialiased">
        {children}
        <script dangerouslySetInnerHTML={{ __html: bodyScript() }} />
      </body>
    </html>
  );
}

/** Skip link, notices, header, main and footer around a page. */
export function PageFrame({ locale, route, children }: { readonly locale: SiteLocale; readonly route: SiteRoute; readonly children: ReactNode }) {
  const t = getTranslator(locale);
  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-[8px] bg-action px-4 py-3 font-semibold text-action-fg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t("nav.skipToContent")}
      </a>
      <NoScriptNote locale={locale} />
      <LiteNotice locale={locale} />
      <LocaleBanner locale={locale} />
      <Header locale={locale} route={route} />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <Footer locale={locale} year={new Date().getFullYear()} />
    </>
  );
}
