import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement, ReactNode } from "react";

type Messages = Record<string, unknown>;

const cache = new Map<string, Messages>();

/** Missing or malformed message keys seen while rendering; tests assert this stays empty. */
export const intlErrors: string[] = [];

/** Loads every web message namespace for a locale, as the admin layout and `OpsIntl` do at runtime. */
export function loadAllMessages(locale: "en" | "pt-BR" = "en"): Messages {
  const hit = cache.get(locale);
  if (hit !== undefined) return hit;
  const dir = join(process.cwd(), "messages", locale);
  const messages: Messages = {};
  for (const file of readdirSync(dir)) {
    if (file.endsWith(".json")) messages[file.slice(0, -5)] = JSON.parse(readFileSync(join(dir, file), "utf8")) as unknown;
  }
  cache.set(locale, messages);
  return messages;
}

export function renderWithProviders(ui: ReactElement, options: { readonly locale?: "en" | "pt-BR"; readonly client?: QueryClient } = {}) {
  const locale = options.locale ?? "en";
  const client = options.client ?? new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale={locale} messages={loadAllMessages(locale)} onError={(error) => intlErrors.push(error.message)} timeZone="America/Sao_Paulo">
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const result = render(ui, { wrapper: Wrapper });
  return { ...result, client };
}
