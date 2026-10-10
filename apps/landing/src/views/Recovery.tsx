import { House, Search } from "lucide-react";

import { Contact } from "@/components/Contact";
import { buttonPrimary, buttonSecondary, container } from "@/components/ui";
import { HelpSearchLink, UnknownCodeNote } from "@/components/UnknownCode";
import { recoveryScript } from "@/lib/inlineScripts";
import { type SiteLocale } from "@/lib/locales";
import { pagePath } from "@/lib/routes";
import { errorCopy, getTranslator } from "@/i18n/messages";

/** EC-SITE-02: the page does not exist. Offers home, help search and contact, never a dead end. */
export function NotFoundView({ locale }: { readonly locale: SiteLocale }) {
  const t = getTranslator(locale);
  const copy = errorCopy(locale, "SITE_PAGE_NOT_FOUND");
  return (
    <div className={`${container} max-w-3xl py-16`} data-page="not-found">
      <script dangerouslySetInnerHTML={{ __html: recoveryScript() }} />
      <h1 className="accent-rule text-4xl font-bold tracking-tight text-balance">{copy?.title}</h1>
      <p className="mt-4 text-lg">{copy?.body}</p>
      <p className="mt-2 text-fg-muted">{copy?.action}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <a href={pagePath("home", locale)} className={buttonPrimary}>
          <House aria-hidden="true" className="size-5" />
          {t("notFound.home")}
        </a>
        <HelpSearchLink href={pagePath("help", locale)} className={buttonSecondary}>
          <Search aria-hidden="true" className="size-5" />
          {t("notFound.help")}
        </HelpSearchLink>
      </div>
      <section className="mt-12" aria-labelledby="contact-title">
        <h2 id="contact-title" className="text-xl font-bold">
          {t("notFound.contact")}
        </h2>
        <Contact locale={locale} className="mt-4" />
      </section>
    </div>
  );
}

/** EC-SITE-07: a help link with a code this site does not know. */
export function HelpUnknownView({ locale }: { readonly locale: SiteLocale }) {
  const t = getTranslator(locale);
  const copy = errorCopy(locale, "SITE_ERROR_CODE_UNKNOWN");
  return (
    <div className={`${container} max-w-3xl py-16`} data-page="help-unknown">
      <script dangerouslySetInnerHTML={{ __html: recoveryScript() }} />
      <h1 className="accent-rule text-4xl font-bold tracking-tight text-balance">{copy?.title}</h1>
      <UnknownCodeNote label={t("helpError.codeLabel")} />
      <p className="mt-4 text-lg">{copy?.body}</p>
      <p className="mt-2 text-fg-muted">{t("helpUnknown.hint")}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <HelpSearchLink href={`${pagePath("help", locale)}#codigos`} className={buttonPrimary}>
          <Search aria-hidden="true" className="size-5" />
          {t("helpUnknown.search")}
        </HelpSearchLink>
        <a href={pagePath("home", locale)} className={buttonSecondary}>
          <House aria-hidden="true" className="size-5" />
          {t("notFound.home")}
        </a>
      </div>
      <section className="mt-12" aria-labelledby="contact-title">
        <h2 id="contact-title" className="text-xl font-bold">
          {t("notFound.contact")}
        </h2>
        <Contact locale={locale} className="mt-4" />
      </section>
    </div>
  );
}
