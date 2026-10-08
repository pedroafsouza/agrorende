"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";

import { ReauthDialog } from "@/components/recovery/ReauthDialog";
import { isApiError } from "@/lib/api";

function retry(failureCount: number, error: unknown): boolean {
  if (isApiError(error)) return error.retryable && failureCount < 2;
  return failureCount < 2;
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache(),
    mutationCache: new MutationCache(),
    defaultOptions: {
      queries: { staleTime: 30_000, retry, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  });
}

/** Client providers for the admin and auth shells: theme (light, dark, outdoor), React Query, toasts, re-auth. */
export function Providers({ children, reauth = true }: { readonly children: ReactNode; readonly reauth?: boolean }) {
  const [client] = useState(makeQueryClient);
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem themes={["light", "dark", "outdoor"]}>
      <QueryClientProvider client={client}>
        {children}
        {reauth ? <ReauthDialog /> : null}
        <Toaster closeButton position="bottom-right" richColors toastOptions={{ className: "min-h-12" }} />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
