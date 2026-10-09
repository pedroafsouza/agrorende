import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

import { SHELL_NAMESPACES, getRequestLocale, loadMessages } from "@/lib/i18n.server";

/** Adds the `analytics` namespace on top of the shell namespaces for `/analytics` (T16.2). */
export async function AnalyticsIntl({ children }: { readonly children: ReactNode }) {
  const locale = await getRequestLocale();
  const messages = await loadMessages(locale, [...SHELL_NAMESPACES, "analytics"]);
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="America/Sao_Paulo">
      {children}
    </NextIntlClientProvider>
  );
}
