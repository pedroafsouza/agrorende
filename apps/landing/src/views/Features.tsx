import { Check, ImageOff } from "lucide-react";

import { CtaGroup, StoreLinks } from "@/components/CtaGroup";
import { Picture } from "@/components/Picture";
import { container } from "@/components/ui";
import { type SiteLocale } from "@/lib/locales";
import { getTranslator, splitList } from "@/i18n/messages";

import { PageIntro } from "./PageIntro";

const FEATURES = ["f1", "f2", "f3", "f4", "f5"] as const;

export function FeaturesView({ locale }: { readonly locale: SiteLocale }) {
  const t = getTranslator(locale);
  return (
    <>
      <PageIntro title={t("features.title")} lead={t("features.lead")} />
      <div className={`${container} flex flex-col gap-20 py-16`}>
        {FEATURES.map((key, index) => (
          <section
            key={key}
            id={key}
            aria-labelledby={`${key}-title`}
            className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14"
          >
            <div className={index % 2 === 1 ? "lg:order-2" : undefined}>
              <h2 id={`${key}-title`} className="text-3xl font-bold tracking-tight">
                {t(`modules.${key}Title`)}
              </h2>
              <p className="mt-3 text-lg text-fg-muted">{t(`modules.${key}Body`)}</p>
              <ul className="mt-6 flex flex-col gap-3">
                {splitList(t(`features.${key}Points`)).map((point) => (
                  <li key={point} className="flex gap-3">
                    <Check aria-hidden="true" className="mt-1 size-5 shrink-0 text-success" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
            <figure className="flex flex-col gap-2">
              <Picture
                name={`feature-${key}`}
                alt={t(`features.imageAlt.${key}`)}
                sizes="(min-width: 1024px) 560px, 100vw"
                className="rounded-[12px] border border-border"
              />
              <figcaption className="flex items-start gap-2 text-sm text-fg-muted" data-placeholder="screenshot">
                <ImageOff aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                {t("features.screenshotPending")}
              </figcaption>
            </figure>
          </section>
        ))}
      </div>
      <section className="border-t border-border bg-surface py-16">
        <div className={`${container} flex flex-col gap-8`}>
          <CtaGroup locale={locale} />
          <StoreLinks locale={locale} />
        </div>
      </section>
    </>
  );
}
