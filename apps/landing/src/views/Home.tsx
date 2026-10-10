import { ArrowRight, Building2, ChevronDown, ClipboardCheck, KeyRound, LayoutDashboard, Tractor, Wrench } from "lucide-react";

import { CtaGroup, StoreLinks } from "@/components/CtaGroup";
import { Demos } from "@/components/Demos";
import { JsonLd } from "@/components/JsonLd";
import { Picture } from "@/components/Picture";
import { StatusChip } from "@/components/StatusChip";
import { card, container, sectionTitle } from "@/components/ui";
import { siteConfig } from "@/lib/config";
import { htmlLang, type SiteLocale } from "@/lib/locales";
import { pagePath } from "@/lib/routes";
import { getTranslator } from "@/i18n/messages";

const FAQ_KEYS = [1, 2, 3, 4, 5] as const;
const MODULE_KEYS = ["f1", "f2", "f3", "f4", "f5"] as const;

export function FaqList({ locale }: { readonly locale: SiteLocale }) {
  const t = getTranslator(locale);
  return (
    <div className="divide-y divide-border border-y border-border">
      {FAQ_KEYS.map((n) => (
        <details key={n} className="faq group">
          <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-4 py-4 text-lg font-semibold">
            {t(`faq.q${n}`)}
            <ChevronDown aria-hidden="true" className="faq-chevron motion-safe-transition size-5 shrink-0" />
          </summary>
          <p className="max-w-3xl pb-5 text-fg-muted">{t(`faq.a${n}`)}</p>
        </details>
      ))}
    </div>
  );
}

export function faqJsonLd(locale: SiteLocale) {
  const t = getTranslator(locale);
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: htmlLang(locale),
    mainEntity: FAQ_KEYS.map((n) => ({
      "@type": "Question",
      name: t(`faq.q${n}`),
      acceptedAnswer: { "@type": "Answer", text: t(`faq.a${n}`) },
    })),
  };
}

function homeJsonLd(locale: SiteLocale) {
  const t = getTranslator(locale);
  const url = `${siteConfig.siteUrl}${pagePath("home", locale)}`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: t("meta.siteName"),
      url,
      logo: `${siteConfig.siteUrl}/icon-192.png`,
      email: siteConfig.contactEmail,
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: t("meta.siteName"),
      applicationCategory: "BusinessApplication",
      operatingSystem: "Android, iOS, Web",
      inLanguage: htmlLang(locale),
      description: t("meta.home.description"),
      url,
      offers: { "@type": "Offer", price: "0", priceCurrency: "BRL", description: t("pricing.trialTitle") },
    },
    faqJsonLd(locale),
  ];
}

export function HomeView({ locale }: { readonly locale: SiteLocale }) {
  const t = getTranslator(locale);
  const steps = [
    { n: 1, icon: ClipboardCheck },
    { n: 2, icon: Wrench },
    { n: 3, icon: KeyRound },
    { n: 4, icon: LayoutDashboard },
  ] as const;
  const audiences = [
    { n: 1, icon: Wrench },
    { n: 2, icon: Tractor },
    { n: 3, icon: Building2 },
  ] as const;
  return (
    <>
      <JsonLd data={homeJsonLd(locale)} />
      <section className="relative isolate overflow-hidden bg-graphite-950 text-white">
        <div className="absolute inset-0 -z-10">
          <Picture name="hero-field" alt="" sizes="100vw" priority className="h-full w-full !aspect-auto" />
          <div className="absolute inset-0 bg-gradient-to-r from-graphite-950 via-graphite-950/85 to-graphite-950/30" />
        </div>
        <div className={`${container} flex min-h-[560px] flex-col justify-center gap-6 py-20 sm:min-h-[620px]`}>
          <h1 className="accent-rule max-w-3xl text-5xl leading-[1.05] font-bold tracking-tight text-balance sm:text-6xl">
            {t("home.heroTitle")}
            <span className="mt-2 block text-[color:var(--mata-400)]">{t("home.heroSubtitle")}</span>
          </h1>
          <p className="max-w-2xl text-lg text-pretty text-white/90 sm:text-xl">{t("home.heroLead")}</p>
          <CtaGroup locale={locale} tone="onDark" />
        </div>
        <p className="sr-only">{t("home.heroImageAlt")}</p>
      </section>

      <section className={`${container} grid gap-10 py-20 lg:grid-cols-[2fr_3fr]`}>
        <div>
          <h2 className={sectionTitle}>{t("home.problemTitle")}</h2>
          <p className="mt-4 text-lg text-fg-muted">{t("home.problemLead")}</p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {([1, 2, 3, 4] as const).map((n) => (
            <li key={n} className={`${card} bg-surface`}>
              <p className="text-lg">{t(`home.problem${n}`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-y border-border bg-surface py-20">
        <div className={container}>
          <h2 className={sectionTitle}>{t("home.stepsTitle")}</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {steps.map(({ n, icon: Icon }) => (
              <li key={n} className={`${card} flex flex-col gap-3`}>
                <span className="flex items-center gap-3">
                  <span className="tabular inline-flex size-10 items-center justify-center rounded-full bg-brand text-lg font-bold text-white">
                    {n}
                  </span>
                  <Icon aria-hidden="true" className="size-6 text-brand" />
                </span>
                <h3 className="text-xl font-bold">{t(`home.step${n}Title`)}</h3>
                <p className="text-fg-muted">{t(`home.step${n}Body`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <Demos locale={locale} />

      <section className={`${container} grid items-center gap-10 py-20 lg:grid-cols-2`}>
        <div>
          <h2 className={sectionTitle}>{t("home.offlineTitle")}</h2>
          <p className="mt-4 text-lg text-fg-muted">{t("home.offlineBody")}</p>
        </div>
        <ol className={`${card} flex flex-col gap-4 bg-surface`}>
          <li className="flex items-center justify-between gap-4">
            <span className="font-semibold">{t("home.step1Title")}</span>
            <StatusChip status="pending" label={t("home.offlineSaved")} />
          </li>
          <li className="flex items-center justify-between gap-4">
            <span className="font-semibold">{t("home.step2Title")}</span>
            <StatusChip status="progress" label={t("home.offlineSending")} />
          </li>
          <li className="flex items-center justify-between gap-4">
            <span className="font-semibold">{t("home.step3Title")}</span>
            <StatusChip status="success" label={t("home.offlineSynced")} />
          </li>
        </ol>
      </section>

      <section className="border-y border-border bg-surface py-20">
        <div className={container}>
          <h2 className={sectionTitle}>{t("home.audienceTitle")}</h2>
          <ul className="mt-10 grid gap-6 md:grid-cols-3">
            {audiences.map(({ n, icon: Icon }) => (
              <li key={n} className={`${card} flex flex-col gap-3`}>
                <Icon aria-hidden="true" className="size-7 text-brand" />
                <h3 className="text-xl font-bold">{t(`home.audience${n}Title`)}</h3>
                <p className="text-fg-muted">{t(`home.audience${n}Body`)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={`${container} py-20`}>
        <h2 className={sectionTitle}>{t("home.modulesTitle")}</h2>
        <p className="mt-4 max-w-2xl text-lg text-fg-muted">{t("home.modulesLead")}</p>
        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {MODULE_KEYS.map((key) => (
            <li key={key} className={`${card} flex flex-col gap-2`}>
              <h3 className="text-xl font-bold">{t(`modules.${key}Title`)}</h3>
              <p className="text-fg-muted">{t(`modules.${key}Body`)}</p>
            </li>
          ))}
        </ul>
        <a href={pagePath("features", locale)} className="prose-link mt-8 inline-flex min-h-12 items-center gap-2 text-lg font-semibold">
          {t("home.modulesLink")}
          <ArrowRight aria-hidden="true" className="size-5" />
        </a>
      </section>

      <section className="border-y border-border bg-surface py-20">
        <div className={`${container} max-w-3xl`}>
          <h2 className={sectionTitle}>{t("home.pilotTitle")}</h2>
          <p className="mt-4 text-lg">{t("home.pilotBody")}</p>
          <p className="mt-4 rounded-[8px] border-2 border-dashed border-border p-4 text-sm text-fg-muted" data-placeholder="pilot">
            {t("home.pilotPlaceholder")}
          </p>
        </div>
      </section>

      <section className={`${container} py-20`}>
        <h2 className={sectionTitle}>{t("home.faqTitle")}</h2>
        <div className="mt-8">
          <FaqList locale={locale} />
        </div>
      </section>

      <section className="bg-[color:var(--mata-800)] py-20 text-white">
        <div className={`${container} flex flex-col gap-6`}>
          <h2 className={`${sectionTitle} max-w-2xl`}>{t("home.finalTitle")}</h2>
          <p className="max-w-2xl text-lg text-white/90">{t("home.finalBody")}</p>
          <CtaGroup locale={locale} tone="onDark" />
          <StoreLinks locale={locale} tone="onDark" />
        </div>
      </section>
    </>
  );
}
