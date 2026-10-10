import { Check, MessageSquareText } from "lucide-react";

import { CtaGroup } from "@/components/CtaGroup";
import { Contact } from "@/components/Contact";
import { card, container } from "@/components/ui";
import { siteConfig } from "@/lib/config";
import { appLocale, type SiteLocale } from "@/lib/locales";
import { getTranslator, splitList } from "@/i18n/messages";

import { PageIntro } from "./PageIntro";

/** Hypothesis from docs/PRD.md: R$ 149 per field user per month. Shown only with SITE_SHOW_PRICES=true. */
export const FIELD_PRICE_CENTS = 14_900;

/** The worked example under the prices: a crew of five technicians. */
export const EXAMPLE_TECHNICIANS = 5;

export function formatBrl(cents: number, locale: SiteLocale): string {
  return new Intl.NumberFormat(appLocale(locale), {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function PricingView({ locale, showPrices = siteConfig.showPrices }: { readonly locale: SiteLocale; readonly showPrices?: boolean }) {
  const t = getTranslator(locale);
  return (
    <>
      <PageIntro title={t("pricing.title")} lead={t("pricing.lead")} />
      <div className={`${container} flex flex-col gap-12 py-16`}>
        <section className={`${card} bg-surface`}>
          <h2 className="text-2xl font-bold">{t("pricing.trialTitle")}</h2>
          <p className="mt-2 max-w-[60ch] text-lg text-fg-muted">{t("pricing.trialBody")}</p>
          <div className="mt-6">
            <CtaGroup locale={locale} withContact={false} />
          </div>
        </section>

        <div className="grid gap-6 md:grid-cols-3" data-prices={showPrices ? "shown" : "hidden"}>
          <section className={`${card} flex flex-col gap-3`}>
            <h2 className="text-xl font-bold">{t("pricing.fieldTitle")}</h2>
            <p className="text-fg-muted">{t("pricing.fieldBody")}</p>
            {showPrices ? (
              <p className="tabular mt-auto text-2xl font-bold" data-price="field">
                {t("pricing.fieldPrice", { price: formatBrl(FIELD_PRICE_CENTS, locale) })}
              </p>
            ) : (
              <p className="mt-auto inline-flex items-center gap-2 text-lg font-bold">
                <MessageSquareText aria-hidden="true" className="size-5 text-brand" />
                {t("pricing.priceOnRequest")}
              </p>
            )}
          </section>
          <section className={`${card} flex flex-col gap-3`}>
            <h2 className="text-xl font-bold">{t("pricing.officeTitle")}</h2>
            <p className="text-fg-muted">{t("pricing.officeBody")}</p>
            <p className="mt-auto inline-flex items-center gap-2 text-lg font-bold">
              <Check aria-hidden="true" className="size-5 text-success" />
              {t("pricing.officePrice")}
            </p>
          </section>
          <section className={`${card} flex flex-col gap-3`}>
            <h2 className="text-xl font-bold">{t("pricing.rentalTitle")}</h2>
            <p className="text-fg-muted">{t("pricing.rentalBody")}</p>
            <p className="mt-auto inline-flex items-center gap-2 text-lg font-bold">
              <MessageSquareText aria-hidden="true" className="size-5 text-brand" />
              {t("pricing.priceOnRequest")}
            </p>
          </section>
        </div>
        {showPrices ? (
          <div className="flex flex-col gap-3">
            <p className="tabular text-xl font-bold" data-price="example">
              {t("pricing.example", {
                count: EXAMPLE_TECHNICIANS,
                total: formatBrl(FIELD_PRICE_CENTS * EXAMPLE_TECHNICIANS, locale),
              })}
            </p>
            <p className="max-w-[65ch] text-fg-muted" data-price-hypothesis="true">
              {t("pricing.pricesHypothesis")}
            </p>
          </div>
        ) : (
          <section className={`${card} flex flex-col gap-4 bg-surface`} aria-labelledby="proposal-title" data-proposal="true">
            <h2 id="proposal-title" className="text-2xl font-bold">
              {t("pricing.proposalTitle")}
            </h2>
            <p className="max-w-[60ch] text-lg text-fg-muted">{t("pricing.proposalBody")}</p>
            <Contact locale={locale} channels="whatsapp" variant="primary" whatsappLabel={t("cta.proposal")} />
          </section>
        )}

        <section>
          <h2 className="text-2xl font-bold">{t("pricing.includedTitle")}</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {splitList(t("pricing.included")).map((item) => (
              <li key={item} className="flex gap-3">
                <Check aria-hidden="true" className="mt-1 size-5 shrink-0 text-success" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
