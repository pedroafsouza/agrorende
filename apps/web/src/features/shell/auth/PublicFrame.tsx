import type { ReactNode } from "react";

import "@/components/shell/theme.css";

import { ShellIntlProvider } from "@/components/shell/IntlProvider";
import { Providers } from "@/components/shell/Providers";

import { PublicTopBar } from "./PublicTopBar";

/** Signed-out frame shared by `(auth)`, `/i/[code]` and `/r/[code]`: theme, language and a centered card. */
export function PublicFrame({ children }: { readonly children: ReactNode }) {
  return (
    <ShellIntlProvider>
      <Providers reauth={false}>
        <div className="flex min-h-screen flex-col bg-[var(--ar-bg)] text-[var(--ar-text)]">
          <PublicTopBar />
          <main className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center" id="main">
            {children}
          </main>
        </div>
      </Providers>
    </ShellIntlProvider>
  );
}
