import { cookies, headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

import { resolveWebLocale } from "@/i18n/request";
import { campoClaroThemeStyle } from "@/styles/theme";

export const metadata: Metadata = {
  title: "AgroRende admin",
  description: "AgroRende admin foundation shell",
};

async function loadWebMessages(locale: string): Promise<Record<string, unknown>> {
  const messages = (await import(`../../messages/${locale}/web.json`)).default as Record<string, unknown>;
  return { web: messages };
}

export default async function RootLayout({ children }: { readonly children: ReactNode }) {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const locale = resolveWebLocale([cookieStore.get("NEXT_LOCALE")?.value ?? "", headerStore.get("accept-language") ?? ""]);
  const messages = await loadWebMessages(locale);

  return (
    <html lang={locale} style={campoClaroThemeStyle}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
