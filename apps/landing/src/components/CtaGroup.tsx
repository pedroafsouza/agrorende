import { ArrowRight, Download } from "lucide-react";

import { siteConfig } from "@/lib/config";
import { type SiteLocale } from "@/lib/locales";
import { getTranslator } from "@/i18n/messages";

import { Contact } from "./Contact";
import { buttonOnDark, buttonOutlineOnDark, buttonPrimary, buttonSecondary } from "./ui";

export function signupHref(): string {
  return `${siteConfig.appUrl}/signup`;
}

export function signInHref(): string {
  return `${siteConfig.appUrl}/login`;
}

/**
 * The one primary CTA ("Testar grátis por 30 dias" → APP_URL/signup) plus WhatsApp as the only
 * secondary action (SITE-04). E-mail lives in the footer and on the help page.
 */
export function CtaGroup({
  locale,
  showNote = true,
  withContact = true,
  tone = "default",
}: {
  readonly locale: SiteLocale;
  readonly showNote?: boolean;
  readonly withContact?: boolean;
  readonly tone?: "default" | "onDark";
}) {
  const t = getTranslator(locale);
  const primary = tone === "onDark" ? buttonOnDark : buttonPrimary;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <a href={signupHref()} className={`${primary} self-start text-lg`} data-cta="signup">
          {t("cta.primary")}
          <ArrowRight aria-hidden="true" className="size-5" />
        </a>
        {showNote ? (
          <p className={tone === "onDark" ? "text-sm text-white/85" : "text-sm text-fg-muted"}>{t("cta.primaryNote")}</p>
        ) : null}
      </div>
      {withContact ? <Contact locale={locale} tone={tone} channels="whatsapp" /> : null}
    </div>
  );
}

/** App store links appear only when their URLs are configured (SITE-04). */
export function StoreLinks({
  locale,
  tone = "default",
}: {
  readonly locale: SiteLocale;
  readonly tone?: "default" | "onDark";
}) {
  const t = getTranslator(locale);
  const secondary = tone === "onDark" ? buttonOutlineOnDark : buttonSecondary;
  const { appStoreUrl, playStoreUrl } = siteConfig;
  if (appStoreUrl === undefined && playStoreUrl === undefined) return null;
  return (
    <div className="flex flex-col gap-3" data-stores="true">
      <p className="font-semibold">{t("cta.storesTitle")}</p>
      <div className="flex flex-wrap gap-3">
        {appStoreUrl !== undefined ? (
          <a href={appStoreUrl} className={secondary} data-store="app-store" rel="noopener">
            <Download aria-hidden="true" className="size-5" />
            {t("cta.appStore")}
          </a>
        ) : null}
        {playStoreUrl !== undefined ? (
          <a href={playStoreUrl} className={secondary} data-store="play-store" rel="noopener">
            <Download aria-hidden="true" className="size-5" />
            {t("cta.playStore")}
          </a>
        ) : null}
      </div>
    </div>
  );
}
