"use client";

import { Apple } from "lucide-react";
import { useTranslations } from "next-intl";

import { buttonVariants } from "@/components/ui/Button";
import { buildUrl } from "@/lib/api";

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24">
      <path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" fill="#4285F4" />
      <path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" fill="#34A853" />
      <path d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14z" fill="#FBBC05" />
      <path d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 6 12 6z" fill="#EA4335" />
    </svg>
  );
}

/** Google and Apple with equal prominence (PLT-01). Both start the browser OAuth flow on the server. */
export function OAuthButtons({ inviteCode, intent = "login" }: { readonly inviteCode?: string; readonly intent?: "login" | "invite" }) {
  const t = useTranslations("auth");
  const query = { intent, ...(inviteCode === undefined ? {} : { inviteCode }) };
  return (
    <div className="flex flex-col gap-2">
      <a className={buttonVariants({ variant: "secondary", size: "primary" })} href={buildUrl("/auth/oauth/google/start", query)}>
        <GoogleMark />
        {t("oauth.google")}
      </a>
      <a className={buttonVariants({ variant: "secondary", size: "primary" })} href={buildUrl("/auth/oauth/apple/start", query)}>
        <Apple aria-hidden="true" className="size-5" />
        {t("oauth.apple")}
      </a>
    </div>
  );
}

export function OrDivider() {
  const t = useTranslations("auth");
  return (
    <div className="flex items-center gap-3 text-sm text-[var(--ar-text-muted)]">
      <span className="h-px flex-1 bg-[var(--ar-border)]" />
      {t("or")}
      <span className="h-px flex-1 bg-[var(--ar-border)]" />
    </div>
  );
}
