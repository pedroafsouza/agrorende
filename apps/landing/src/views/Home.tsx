import { ArrowRight, Captions, Check, ChevronDown, Clock, PlayCircle, X } from "lucide-react";

import { Animation } from "@/components/Animation";
import { CtaGroup, StoreLinks } from "@/components/CtaGroup";
import { DemoVideo } from "@/components/DemoVideo";
import { JsonLd } from "@/components/JsonLd";
import { container, sectionTitle } from "@/components/ui";
import { siteConfig } from "@/lib/config";
import { demoVideoAssets, type DemoVideoAssets } from "@/lib/demoVideo";
import { htmlLang, type SiteLocale } from "@/lib/locales";
import { pagePath } from "@/lib/routes";
import { getTranslator } from "@/i18n/messages";

export type FaqKey = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** Questions a buyer asks before signing up: price, contract, data, support, after the trial, brands. */
export const BUYER_FAQ_KEYS: readonly FaqKey[] = [1, 2, 3, 4, 5, 6];
export const ALL_FAQ_KEYS: readonly FaqKey[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export function FaqList({ locale, keys = ALL_FAQ_KEYS }: { readonly locale: SiteLocale; readonly keys?: readonly FaqKey[] }) {
  const t = getTranslator(locale);
  return (
    <div className="divide-y divide-border border-y border-border">
      {keys.map((n) => (
        <details key={n} className="faq group">
          <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-4 py-4 text-lg font-semibold">
            {t(`faq.q${n}`)}
            <ChevronDown aria-hidden="true" className="faq-chevron motion-safe-transition size-5 shrink-0" />
          </summary>
          <p className="max-w-[65ch] pb-5 text-fg-muted">{t(`faq.a${n}`)}</p>
        </details>
      ))}
    </div>
  );
}

export function faqJsonLd(locale: SiteLocale, keys: readonly FaqKey[] = ALL_FAQ_KEYS) {
  const t = getTranslator(locale);
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: htmlLang(locale),
    mainEntity: keys.map((n) => ({
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
    faqJsonLd(locale, BUYER_FAQ_KEYS),
  ];
}

export function HomeView({
  locale,
  video = demoVideoAssets(),
}: {
  readonly locale: SiteLocale;
  /** The demo section and the hero link only render when the video file shipped with this build. */
  readonly video?: DemoVideoAssets;
}) {
  const t = getTranslator(locale);
  const showVideo = video.video;
  const steps = [
    { n: 1, animation: "report-offline" },
    { n: 2, animation: "flow-loop" },
    { n: 3, animation: "machine-cost" },
  ] as const;
  return (
    <>
      <JsonLd data={homeJsonLd(locale)} />
      <section className="border-b border-border">
        <div className={`${container} grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[1.1fr_1fr]`}>
          <div className="flex flex-col gap-6">
            <h1 className="accent-rule max-w-[18ch] text-4xl leading-[1.08] font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              {t("home.heroTitle")}
            </h1>
            <p className="max-w-[60ch] text-lg text-pretty text-fg-muted sm:text-xl">{t("home.heroLead")}</p>
            <CtaGroup locale={locale} />
            {showVideo ? (
              <a
                href="#demo"
                className="prose-link inline-flex min-h-12 items-center gap-2 self-start font-semibold"
                data-cta="video"
              >
                <PlayCircle aria-hidden="true" className="size-5" />
                {t("cta.video")}
              </a>
            ) : null}
          </div>
          <Animation id="welcome" locale={locale} playOnce className="w-full" />
        </div>
      </section>

      <section className={`${container} py-16 sm:py-20`} aria-labelledby="problem-title">
        <h2 id="problem-title" className={sectionTitle}>
          {t("home.problemTitle")}
        </h2>
        <p className="mt-4 max-w-[60ch] text-lg text-fg-muted">{t("home.problemLead")}</p>
        <ul className="mt-10 grid gap-4">
          {([1, 2, 3] as const).map((n) => (
            <li key={n} className="grid overflow-hidden rounded-[12px] border border-border sm:grid-cols-2">
              <div className="flex gap-3 bg-surface p-5">
                <X aria-hidden="true" className="mt-1 size-5 shrink-0 text-danger" />
                <p>
                  <span className="block text-sm font-semibold text-fg-muted">{t("home.todayLabel")}</span>
                  {t(`home.problem${n}Today`)}
                </p>
              </div>
              <div className="flex gap-3 border-t border-border bg-bg p-5 sm:border-t-0 sm:border-l">
                <Check aria-hidden="true" className="mt-1 size-5 shrink-0 text-success" />
                <p>
                  <span className="block text-sm font-semibold text-success">{t("home.withLabel")}</span>
                  {t(`home.problem${n}With`)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {showVideo ? (
        <section id="demo" className="scroll-mt-20 border-t border-border bg-surface py-16 sm:py-20" aria-labelledby="demo-title">
          <div className={`${container} grid items-center gap-10 lg:grid-cols-[2fr_3fr]`}>
            <div className="flex flex-col gap-4">
              <h2 id="demo-title" className={sectionTitle}>
                {t("home.videoTitle")}
              </h2>
              <p className="max-w-[50ch] text-lg text-fg-muted">{t("home.videoBody")}</p>
              <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-fg-muted">
                <li className="inline-flex items-center gap-2">
                  <Clock aria-hidden="true" className="size-5" />
                  {t("home.videoLength")}
                </li>
                {video.captions ? (
                  <li className="inline-flex items-center gap-2">
                    <Captions aria-hidden="true" className="size-5" />
                    {t("home.videoCaptions")}
                  </li>
                ) : null}
              </ul>
            </div>
            <DemoVideo locale={locale} assets={video} className="shadow-xl" />
          </div>
        </section>
      ) : null}

      <section className="border-y border-border bg-surface py-16 sm:py-20" aria-labelledby="steps-title">
        <div className={container}>
          <h2 id="steps-title" className={sectionTitle}>
            {t("home.stepsTitle")}
          </h2>
          <ol className="mt-10 grid gap-10 md:grid-cols-3 md:gap-6">
            {steps.map(({ n, animation }) => (
              <li key={n} className="flex flex-col gap-4">
                <Animation id={animation} locale={locale} className="w-full max-w-sm" />
                <div className="flex items-start gap-3">
                  <span className="tabular inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-action text-lg font-bold text-action-fg">
                    {n}
                  </span>
                  <h3 className="pt-1 text-xl font-bold">{t(`home.step${n}Title`)}</h3>
                </div>
                <p className="max-w-[60ch] text-fg-muted">{t(`home.step${n}Body`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={`${container} grid items-center gap-10 py-16 sm:py-20 md:grid-cols-[3fr_2fr]`} aria-labelledby="offline-title">
        <div>
          <h2 id="offline-title" className={sectionTitle}>
            {t("home.offlineTitle")}
          </h2>
          <p className="mt-4 max-w-[60ch] text-lg text-fg-muted">{t("home.offlineBody")}</p>
        </div>
        <Animation id="saved-on-phone" locale={locale} className="w-full max-w-sm justify-self-center" />
      </section>

      <section className="border-y border-border bg-surface py-16 sm:py-20" aria-labelledby="mission-title">
        <div className={`${container} grid items-center gap-10 md:grid-cols-[2fr_3fr]`}>
          <Animation id="office-live" locale={locale} className="order-last w-full max-w-sm justify-self-center md:order-first" />
          <div>
            <h2 id="mission-title" className={sectionTitle}>
              {t("home.missionTitle")}
            </h2>
            <p className="mt-4 max-w-[60ch] text-lg text-pretty">{t("home.missionBody")}</p>
          </div>
        </div>
      </section>

      <section className={`${container} py-16 sm:py-20`} aria-labelledby="faq-title">
        <h2 id="faq-title" className={sectionTitle}>
          {t("home.faqTitle")}
        </h2>
        <div className="mt-8">
          <FaqList locale={locale} keys={BUYER_FAQ_KEYS} />
        </div>
        <a href={pagePath("help", locale)} className="prose-link mt-6 inline-flex min-h-12 items-center gap-2 font-semibold">
          {t("home.faqMore")}
          <ArrowRight aria-hidden="true" className="size-5" />
        </a>
      </section>

      <section className="bg-[color:var(--mata-800)] py-16 text-white sm:py-20">
        <div className={`${container} flex flex-col gap-6`}>
          <h2 className={`${sectionTitle} max-w-2xl`}>{t("home.finalTitle")}</h2>
          <p className="max-w-[60ch] text-lg text-white/90">{t("home.finalBody")}</p>
          <CtaGroup locale={locale} tone="onDark" />
          <StoreLinks locale={locale} tone="onDark" />
        </div>
      </section>
    </>
  );
}
