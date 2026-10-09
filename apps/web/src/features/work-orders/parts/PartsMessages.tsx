"use client";

import { NextIntlClientProvider, useLocale, useMessages, useTimeZone } from "next-intl";
import type { ReactNode } from "react";

import en from "../../../../messages/en/parts.json";
import ptBR from "../../../../messages/pt-BR/parts.json";

/**
 * Adds the `parts` namespace under the work-order detail page, whose server provider only loads `jobs`
 * (change request T14-004). The bundle is small, so it ships with the panels.
 */
export function PartsMessages({ children }: { readonly children: ReactNode }) {
  const locale = useLocale();
  const messages = useMessages();
  const timeZone = useTimeZone();
  return (
    <NextIntlClientProvider locale={locale} messages={{ ...messages, parts: locale === "en" ? en : ptBR }} timeZone={timeZone}>
      {children}
    </NextIntlClientProvider>
  );
}
