import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

import { SHELL_NAMESPACES, getRequestLocale, loadMessages } from "@/lib/i18n.server";

/** Adds the `maintenance` namespace on top of the shell namespaces for the preventive maintenance page. */
export async function MaintenanceIntl({ children }: { readonly children: ReactNode }) {
  const locale = await getRequestLocale();
  const messages = await loadMessages(locale, [...SHELL_NAMESPACES, "maintenance"]);
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="America/Sao_Paulo">
      {children}
    </NextIntlClientProvider>
  );
}
