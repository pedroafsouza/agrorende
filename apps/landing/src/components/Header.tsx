import { Languages, LogIn, Menu } from "lucide-react";

import { otherLocale, htmlLang, type SiteLocale } from "@/lib/locales";
import { pagePath, pathFor, type SiteRoute } from "@/lib/routes";
import { getTranslator } from "@/i18n/messages";

import { signInHref, signupHref } from "./CtaGroup";
import { Logo } from "./Logo";
import { buttonPrimary, container } from "./ui";

const navLink =
  "inline-flex min-h-12 items-center rounded-[8px] px-3 text-base font-semibold text-fg no-underline hover:bg-surface";

/** Switches to the same page in the other locale (SITE-01). */
export function LanguageSwitch({ locale, route }: { readonly locale: SiteLocale; readonly route: SiteRoute }) {
  const t = getTranslator(locale);
  const target = otherLocale(locale);
  return (
    <a
      href={pathFor(route, target)}
      hrefLang={htmlLang(target)}
      lang={htmlLang(target)}
      aria-label={t("nav.switchToLabel")}
      className={navLink}
      data-language-switch="true"
    >
      <Languages aria-hidden="true" className="mr-1.5 size-5" />
      {t("nav.switchTo")}
    </a>
  );
}

export function Header({ locale, route }: { readonly locale: SiteLocale; readonly route: SiteRoute }) {
  const t = getTranslator(locale);
  const current = route.kind === "page" ? route.key : "help";
  const items = [
    { key: "features", label: t("nav.features") },
    { key: "pricing", label: t("nav.pricing") },
    { key: "help", label: t("nav.help") },
  ] as const;
  const links = items.map((item) => (
    <a
      key={item.key}
      href={pagePath(item.key, locale)}
      aria-current={current === item.key ? "page" : undefined}
      className={`${navLink} aria-[current=page]:underline aria-[current=page]:decoration-accent aria-[current=page]:decoration-[3px] aria-[current=page]:underline-offset-8`}
    >
      {item.label}
    </a>
  ));
  return (
    <header className="border-b border-border bg-bg">
      <div className={`${container} flex min-h-[72px] items-center justify-between gap-4`}>
        <Logo name={t("meta.siteName")} label={t("nav.homeLink")} href={pagePath("home", locale)} />
        <nav aria-label={t("nav.label")} className="hidden items-center gap-1 lg:flex">
          {links}
        </nav>
        <div className="hidden items-center gap-1 lg:flex">
          <LanguageSwitch locale={locale} route={route} />
          <a href={signInHref()} className={navLink} data-cta="signin">
            <LogIn aria-hidden="true" className="mr-1.5 size-5" />
            {t("nav.signIn")}
          </a>
          <a href={signupHref()} className={`${buttonPrimary} ml-2`} data-cta="signup">
            {t("cta.primary")}
          </a>
        </div>
        <details className="menu relative lg:hidden">
          <summary className="inline-flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-[8px] border-2 border-border px-4 font-semibold">
            <Menu aria-hidden="true" className="size-5" />
            {t("nav.menu")}
          </summary>
          <div className="absolute right-0 z-20 mt-2 flex w-[min(20rem,calc(100vw-2.5rem))] flex-col gap-1 rounded-[12px] border border-border bg-bg p-3 shadow-lg">
            <nav aria-label={t("nav.label")} className="flex flex-col gap-1">
              {links}
            </nav>
            <hr className="my-1 border-border" />
            <LanguageSwitch locale={locale} route={route} />
            <a href={signInHref()} className={navLink}>
              <LogIn aria-hidden="true" className="mr-1.5 size-5" />
              {t("nav.signIn")}
            </a>
            <a href={signupHref()} className={`${buttonPrimary} mt-1`}>
              {t("cta.primary")}
            </a>
          </div>
        </details>
      </div>
    </header>
  );
}
