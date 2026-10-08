import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

import { SHELL_NAMESPACES, getRequestLocale, loadMessages } from "@/lib/i18n.server";

/** Adds the `ops`, `costs` and `attention` namespaces on top of the shell namespaces for the T09 pages. */
export async function OpsIntl({ children }: { readonly children: ReactNode }) {
  const locale = await getRequestLocale();
  const messages = await loadMessages(locale, [...SHELL_NAMESPACES, "ops", "costs", "attention"]);
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="America/Sao_Paulo">
      {children}
    </NextIntlClientProvider>
  );
}
