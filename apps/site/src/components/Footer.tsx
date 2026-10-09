import { Mail, ShieldCheck } from "lucide-react";

import { siteConfig } from "@/lib/config";
import { type SiteLocale } from "@/lib/locales";
import { pagePath } from "@/lib/routes";
import { getTranslator } from "@/i18n/messages";

import { Logo } from "./Logo";
import { container } from "./ui";

const footerLink = "inline-flex min-h-12 items-center text-base text-fg underline-offset-4 hover:underline";
const heading = "text-sm font-semibold uppercase tracking-[0.08em] text-fg-muted";

export function Footer({ locale, year }: { readonly locale: SiteLocale; readonly year: number }) {
  const t = getTranslator(locale);
  return (
    <footer aria-label={t("footer.label")} className="mt-auto border-t border-border bg-surface">
      <div className={`${container} grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4`}>
        <div className="flex flex-col gap-3">
          <Logo name={t("meta.siteName")} label={t("nav.homeLink")} href={pagePath("home", locale)} />
          <p className="text-fg-muted">{t("meta.tagline")}</p>
        </div>
        <div className="flex flex-col">
          <h2 className={heading}>{t("footer.product")}</h2>
          <a className={footerLink} href={pagePath("features", locale)}>
            {t("nav.features")}
          </a>
          <a className={footerLink} href={pagePath("pricing", locale)}>
            {t("nav.pricing")}
          </a>
          <a className={footerLink} href={pagePath("help", locale)}>
            {t("nav.help")}
          </a>
        </div>
        <div className="flex flex-col">
          <h2 className={heading}>{t("footer.legal")}</h2>
          <a className={footerLink} href={pagePath("privacy", locale)}>
            {t("footer.privacy")}
          </a>
          <a className={footerLink} href={pagePath("terms", locale)}>
            {t("footer.terms")}
          </a>
          <a className={footerLink} href={pagePath("dpa", locale)}>
            {t("footer.dpa")}
          </a>
          <a className={footerLink} href={pagePath("deleteAccount", locale)}>
            {t("footer.deleteAccount")}
          </a>
        </div>
        <div className="flex flex-col">
          <h2 className={heading}>{t("footer.contact")}</h2>
          <a className={`${footerLink} gap-2`} href={`mailto:${siteConfig.contactEmail}`}>
            <Mail aria-hidden="true" className="size-4 shrink-0" />
            {siteConfig.contactEmail}
          </a>
          <p className="mt-2 text-sm text-fg-muted">{t("footer.dpo")}</p>
          <a className={`${footerLink} gap-2`} href={`mailto:${siteConfig.privacyEmail}`}>
            <ShieldCheck aria-hidden="true" className="size-4 shrink-0" />
            {siteConfig.privacyEmail}
          </a>
        </div>
      </div>
      <div className="border-t border-border">
        <div className={`${container} flex flex-col gap-2 py-5 text-sm text-fg-muted sm:flex-row sm:justify-between`}>
          <p>{t("footer.noCookies")}</p>
          <p>{t("footer.copyright", { year })}</p>
        </div>
      </div>
    </footer>
  );
}
