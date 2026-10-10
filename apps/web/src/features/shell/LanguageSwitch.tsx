"use client";

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { LOCALE_META, SUPPORTED_LOCALES, type SupportedLocale } from "@agrorende/i18n/locales";

import { api } from "@/lib/api";

/** Sets the NEXT_LOCALE cookie, persists the preference with `PATCH /me` when signed in, and re-renders (PLT-03). */
export function LanguageSwitch({ persist = true, showLabel = false }: { readonly persist?: boolean; readonly showLabel?: boolean }) {
  const t = useTranslations("admin");
  const locale = useLocale();
  const router = useRouter();
  const change = async (next: SupportedLocale) => {
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; samesite=lax`;
    if (persist) {
      try {
        await api("/me", { method: "PATCH", body: { locale: next } });
      } catch {
        // The cookie already switched the UI; the server copy is retried on the next change.
      }
    }
    router.refresh();
  };
  return (
    <label className="flex min-h-12 items-center gap-2 rounded-controls px-2 text-sm font-semibold hover:bg-[var(--ar-surface-muted)]">
      <Languages aria-hidden="true" className="size-5" />
      <span className={showLabel ? "flex-1" : "sr-only"}>{t("shell.language")}</span>
      <select className="min-h-12 bg-transparent font-semibold" onChange={(e) => void change(e.target.value as SupportedLocale)} value={locale}>
        {SUPPORTED_LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_META[code].nativeLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
