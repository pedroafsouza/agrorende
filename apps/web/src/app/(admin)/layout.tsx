import type { ReactNode } from "react";

import "@/components/shell/theme.css";

import { Providers } from "@/components/shell/Providers";
import { ShellIntlProvider } from "@/components/shell/IntlProvider";
import { AdminShell } from "@/features/shell/AdminShell";
import { EnvRibbon } from "@/features/shell/EnvRibbon";
import { OfficeRoleRequired } from "@/features/shell/OfficeRoleRequired";
import { OrgBanner } from "@/features/shell/OrgBanner";
import { supportWhatsApp } from "@/features/tenancy/server";
import { readSession } from "@/lib/session.server";
import { serverConfig } from "@/server/config";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { readonly children: ReactNode }) {
  const session = await readSession();
  return (
    <ShellIntlProvider>
      <Providers>
        {session?.role === "FIELD" ? (
          <OfficeRoleRequired />
        ) : (
          <AdminShell banner={<OrgBanner supportWhatsApp={supportWhatsApp()} />} ribbon={<EnvRibbon appEnv={serverConfig.appEnv} />} role={session?.role ?? null}>
            {children}
          </AdminShell>
        )}
      </Providers>
    </ShellIntlProvider>
  );
}
