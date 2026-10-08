import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

import { getRequestLocale, loadMessages } from "@/lib/i18n.server";

/** Nested next-intl provider carrying every namespace the shell and master-data screens need. */
export async function ShellIntlProvider({ children }: { readonly children: ReactNode }) {
  const locale = await getRequestLocale();
  const messages = await loadMessages(locale);
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="America/Sao_Paulo">
      {children}
    </NextIntlClientProvider>
  );
}
