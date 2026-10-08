"use client";

import { Apple, LogOut, Play, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button, buttonVariants } from "@/components/ui/Button";
import { api } from "@/lib/api";

const APP_STORE_URL = "https://apps.apple.com/br/search?term=AgroRende";
const PLAY_STORE_URL = "https://play.google.com/store/search?q=AgroRende&c=apps";

/** FIELD users who open the admin land here: explain, point to the app, offer sign-out (EC-AUTH OFFICE_ROLE_REQUIRED). */
export function OfficeRoleRequired() {
  const t = useTranslations("admin");
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
      <Smartphone aria-hidden="true" className="size-12 text-[var(--ar-primary)]" />
      <h1 className="text-2xl font-bold">{t("officeRole.title")}</h1>
      <p className="text-[var(--ar-text-muted)]">{t("officeRole.body")}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <a className={buttonVariants({ variant: "secondary" })} href={APP_STORE_URL} rel="noreferrer" target="_blank">
          <Apple aria-hidden="true" className="size-5" />
          {t("officeRole.appStore")}
        </a>
        <a className={buttonVariants({ variant: "secondary" })} href={PLAY_STORE_URL} rel="noreferrer" target="_blank">
          <Play aria-hidden="true" className="size-5" />
          {t("officeRole.playStore")}
        </a>
      </div>
      <Button
        icon={<LogOut aria-hidden="true" className="size-4" />}
        onClick={() => {
          void api("/auth/logout", { method: "POST" }).finally(() => window.location.assign("/login"));
        }}
        size="primary"
        variant="primary"
      >
        {t("officeRole.signOut")}
      </Button>
    </main>
  );
}
