import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import "@/components/shell/theme.css";

import { ShellIntlProvider } from "@/components/shell/IntlProvider";
import { Providers } from "@/components/shell/Providers";
import { serverConfig } from "@/server/config";

export const dynamic = "force-dynamic";

/** Dev-only: the whole group 404s in production (T04.20). */
export default function StyleGuideLayout({ children }: { readonly children: ReactNode }) {
  if (serverConfig.appEnv === "production") notFound();
  return (
    <ShellIntlProvider>
      <Providers reauth={false}>
        <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 bg-[var(--ar-bg)] p-6 text-[var(--ar-text)]">{children}</main>
      </Providers>
    </ShellIntlProvider>
  );
}
