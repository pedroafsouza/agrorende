import { ChevronDown } from "lucide-react";

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
      <div className={`${container} flex flex-col gap-14 py-14 sm:py-16`}>
        <section aria-labelledby="contact-title" className="rounded-[12px] border border-border bg-surface p-6">
          <h2 id="contact-title" className="text-2xl font-bold">
            {t("help.contactTitle")}
          </h2>
          <p className="mt-2 max-w-[60ch] text-fg-muted">{t("help.contactBody")}</p>
          <Contact locale={locale} className="mt-5" />
        </section>
        <section aria-labelledby="faq-title">
          <h2 id="faq-title" className={sectionTitle}>
            {t("help.faqTitle")}
          </h2>
          <div className="mt-8">
            <FaqList locale={locale} />
          </div>
        </section>
        <details id="codigos" className="faq group rounded-[12px] border border-border" data-help-codes="true">
          <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-4 px-5 py-4 text-lg font-semibold">
            {t("help.codesSummary")}
            <ChevronDown aria-hidden="true" className="faq-chevron motion-safe-transition size-5 shrink-0" />
          </summary>
          <div className="border-t border-border px-5 pt-4 pb-6">
            <p className="max-w-[60ch] text-fg-muted">{t("help.codesLead")}</p>
            <div className="mt-6">
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
          </div>
        </details>
      </div>
    </>
  );
}
