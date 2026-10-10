import { Building2, Mail, Monitor, ShieldCheck, Smartphone } from "lucide-react";

import { card, container } from "@/components/ui";
import { siteConfig } from "@/lib/config";
import { type SiteLocale } from "@/lib/locales";
import { getTranslator, splitList } from "@/i18n/messages";

import { PageIntro } from "./PageIntro";

/** Public account-deletion instructions required by Google Play and the App Store (SITE-03). */
export function DeleteAccountView({ locale }: { readonly locale: SiteLocale }) {
  const t = getTranslator(locale);
  const steps = [
    { key: "app", icon: Smartphone },
    { key: "web", icon: Monitor },
  ] as const;
  return (
    <>
      <PageIntro title={t("deleteAccount.title")} lead={t("deleteAccount.lead")} />
      <div className={`${container} flex max-w-4xl flex-col gap-10 py-14`}>
        <div className="grid gap-6 md:grid-cols-2">
          {steps.map(({ key, icon: Icon }) => (
            <section key={key} className={card} aria-labelledby={`${key}-steps`}>
              <h2 id={`${key}-steps`} className="flex items-center gap-2 text-xl font-bold">
                <Icon aria-hidden="true" className="size-6 text-brand" />
                {t(`deleteAccount.${key}Title`)}
              </h2>
              <ol className="mt-4 flex list-decimal flex-col gap-2 pl-6">
                {splitList(t(`deleteAccount.${key}Steps`)).map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </section>
          ))}
        </div>
        <section aria-labelledby="kept" className="flex gap-4">
          <ShieldCheck aria-hidden="true" className="mt-1 size-6 shrink-0 text-success" />
          <div>
            <h2 id="kept" className="text-xl font-bold">
              {t("deleteAccount.keptTitle")}
            </h2>
            <p className="mt-2">{t("deleteAccount.keptBody")}</p>
          </div>
        </section>
        <section aria-labelledby="company" className="flex gap-4">
          <Building2 aria-hidden="true" className="mt-1 size-6 shrink-0 text-brand" />
          <div>
            <h2 id="company" className="text-xl font-bold">
              {t("deleteAccount.companyTitle")}
            </h2>
            <p className="mt-2">{t("deleteAccount.companyBody")}</p>
          </div>
        </section>
        <section aria-labelledby="no-access" className="flex gap-4">
          <Mail aria-hidden="true" className="mt-1 size-6 shrink-0 text-brand" />
          <div>
            <h2 id="no-access" className="text-xl font-bold">
              {t("deleteAccount.noAccessTitle")}
            </h2>
            <p className="mt-2">{t("deleteAccount.noAccessBody", { email: siteConfig.privacyEmail })}</p>
            <a href={`mailto:${siteConfig.privacyEmail}`} className="prose-link mt-2 inline-flex min-h-12 items-center font-semibold">
              {siteConfig.privacyEmail}
            </a>
          </div>
        </section>
      </div>
    </>
  );
}
