import { Contact } from "@/components/Contact";
import { HelpSearch, type HelpSearchGroup } from "@/components/HelpSearch";
import { JsonLd } from "@/components/JsonLd";
import { container, sectionTitle } from "@/components/ui";
import { buildHelpIndex, HELP_GROUPS } from "@/lib/helpIndex";
import { helpErrorBase } from "@/lib/routes";
import { type SiteLocale } from "@/lib/locales";
import { getTranslator } from "@/i18n/messages";

import { FaqList, faqJsonLd } from "./Home";
import { PageIntro } from "./PageIntro";

export function HelpView({ locale }: { readonly locale: SiteLocale }) {
  const t = getTranslator(locale);
  const index = buildHelpIndex(locale);
  const sentinel = 987654;
  const groupLabels: Readonly<Record<string, string>> = Object.fromEntries(HELP_GROUPS.map((group) => [group, t(`help.groups.${group}`)]));
  const groups: HelpSearchGroup[] = index.map(({ group, items }) => [group, groupLabels[group] ?? group, items.map(({ code, title }) => [code, title] as const)]);
  return (
    <>
      <JsonLd data={faqJsonLd(locale)} />
      <PageIntro title={t("help.title")} lead={t("help.lead")} />
      <div className={`${container} flex flex-col gap-16 py-16`}>
        <section aria-labelledby="faq-title">
          <h2 id="faq-title" className={sectionTitle}>
            {t("help.faqTitle")}
          </h2>
          <div className="mt-8">
            <FaqList locale={locale} />
          </div>
        </section>
        <section aria-labelledby="codes-title" id="codigos">
          <h2 id="codes-title" className={sectionTitle}>
            {t("help.codesTitle")}
          </h2>
          <p className="mt-3 max-w-2xl text-lg text-fg-muted">{t("help.codesLead")}</p>
          <div className="mt-8">
            <HelpSearch
              groups={groups}
              hrefBase={helpErrorBase(locale)}
              labels={{
                searchLabel: t("help.searchLabel"),
                searchPlaceholder: t("help.searchPlaceholder"),
                searchEmpty: t("help.searchEmpty"),
                countOne: t("help.searchCount", { count: 1 }),
                countOther: t("help.searchCount", { count: sentinel }).replace(/987[.,\u00a0]?654/u, "{count}"),
              }}
            />
          </div>
        </section>
        <section aria-labelledby="contact-title" className="rounded-[12px] border border-border bg-surface p-6">
          <h2 id="contact-title" className="text-2xl font-bold">
            {t("help.contactTitle")}
          </h2>
          <p className="mt-2 max-w-2xl text-fg-muted">{t("help.contactBody")}</p>
          <Contact locale={locale} className="mt-5" />
        </section>
      </div>
    </>
  );
}
