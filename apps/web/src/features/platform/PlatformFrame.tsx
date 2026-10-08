"use client";

import { LogOut, Sprout } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";

import { platformApi } from "./platformApi";

/** Staff console chrome: a deliberately plain bar so nobody mistakes it for a tenant's office. */
export function PlatformFrame({ children }: { readonly children: ReactNode }) {
  const t = useTranslations("platform");
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const signedIn = !pathname.startsWith("/platform/login");
  const logout = async () => {
    setBusy(true);
    try {
      await platformApi("/auth/logout", { method: "POST" });
    } finally {
      window.location.assign("/platform/login");
    }
  };
  return (
    <div className="flex min-h-screen flex-col bg-[var(--ar-bg)] text-[var(--ar-text)]">
      <header className="flex min-h-14 items-center gap-3 border-b-2 border-[var(--ar-text)] bg-[var(--ar-surface)] px-4 lg:px-6">
        <Link className="flex min-h-12 items-center gap-2 font-bold" href={signedIn ? "/platform/orgs" : "/platform/login"}>
          <Sprout aria-hidden="true" className="size-6 text-[var(--ar-primary-text)]" />
          {t("brand")}
        </Link>
        <span className="rounded-full border border-[var(--ar-border-strong)] px-2 py-0.5 text-xs font-semibold">{t("staffOnly")}</span>
        <div className="flex-1" />
        {signedIn ? (
          <Button busy={busy} icon={<LogOut aria-hidden="true" className="size-5" />} onClick={() => void logout()} variant="ghost">
            {t("logout")}
          </Button>
        ) : null}
      </header>
      <main className="flex flex-1 flex-col px-4 py-6 lg:px-6" id="main">
        {children}
      </main>
    </div>
  );
}
