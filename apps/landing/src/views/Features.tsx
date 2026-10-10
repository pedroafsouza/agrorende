import { existsSync } from "node:fs";
import path from "node:path";

import type { AnimationId } from "@agrorende/motion/lazy";
import { Check } from "lucide-react";

import { Animation } from "@/components/Animation";
import { CtaGroup, StoreLinks } from "@/components/CtaGroup";
import { card, container, sectionTitle } from "@/components/ui";
import { type SiteLocale } from "@/lib/locales";
import { getTranslator, splitList } from "@/i18n/messages";

import { PageIntro } from "./PageIntro";

/** The product video and its captions are produced separately and dropped into public/video. */
export const DEMO_VIDEO = {
  src: "/video/agrorende-demo-pt-BR.mp4",
  captions: "/video/agrorende-demo-pt-BR.vtt",
  poster: "/video/agrorende-demo-pt-BR.jpg",
} as const;

function publicFileExists(publicPath: string): boolean {
  return existsSync(path.join(process.cwd(), "public", publicPath));
}

/** Read at build time: the static export only ships a player when the video file is there. */
export function demoVideoAssets() {
  return {
    video: publicFileExists(DEMO_VIDEO.src),
    captions: publicFileExists(DEMO_VIDEO.captions),
    poster: publicFileExists(DEMO_VIDEO.poster),
  };
}

const JOBS: readonly { key: "job1" | "job2" | "job3"; animation: AnimationId }[] = [
  { key: "job1", animation: "report-offline" },
  { key: "job2", animation: "rental-handover" },
  { key: "job3", animation: "machine-cost" },
];

const MODULES = ["f1", "f2", "f3", "f4", "f5"] as const;

export function FeaturesView({
  locale,
  assets = demoVideoAssets(),
}: {
  readonly locale: SiteLocale;
  readonly assets?: ReturnType<typeof demoVideoAssets>;
}) {
  const t = getTranslator(locale);
  return (
    <>
      <PageIntro title={t("features.title")} lead={t("features.lead")} />

      <section id="video" aria-labelledby="video-title" className={`${container} py-14 sm:py-16`}>
        <h2 id="video-title" className={sectionTitle}>
          {t("features.videoTitle")}
        </h2>
        {assets.video ? (
          <>
            <p className="mt-4 max-w-[60ch] text-lg text-fg-muted">{t("features.videoBody")}</p>
            <video
              className="mt-8 aspect-video w-full rounded-[16px] border border-border bg-graphite-950"
              controls
              preload="none"
              poster={assets.poster ? DEMO_VIDEO.poster : undefined}
              data-video="demo"
            >
              <source src={DEMO_VIDEO.src} type="video/mp4" />
              {assets.captions ? (
                <track kind="captions" srcLang="pt-BR" src={DEMO_VIDEO.captions} label={t("features.captions")} default />
              ) : null}
              <p>
                {t("features.videoUnsupported")}{" "}
                <a className="prose-link" href={DEMO_VIDEO.src}>
                  {t("features.videoDownload")}
                </a>
              </p>
            </video>
          </>
        ) : (
          <div className="mt-8 grid items-center gap-8 md:grid-cols-[2fr_3fr]" data-video="soon">
            <Animation id="flow-loop" locale={locale} className="w-full max-w-sm justify-self-center" />
            <div>
              <p className="text-2xl font-bold">{t("features.videoSoon")}</p>
              <p className="mt-3 max-w-[60ch] text-lg text-fg-muted">{t("features.videoSoonBody")}</p>
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="jobs-title" className="border-y border-border bg-surface py-14 sm:py-16">
        <div className={container}>
          <h2 id="jobs-title" className={sectionTitle}>
            {t("features.jobsTitle")}
          </h2>
          <div className="mt-12 flex flex-col gap-16">
            {JOBS.map(({ key, animation }, index) => (
              <section key={key} id={key} aria-labelledby={`${key}-title`} className="grid items-center gap-8 md:grid-cols-2 lg:gap-14">
                <div className={index % 2 === 1 ? "md:order-2" : undefined}>
                  <h3 id={`${key}-title`} className="text-2xl font-bold tracking-tight sm:text-3xl">
                    {t(`features.${key}Title`)}
                  </h3>
                  <p className="mt-3 max-w-[60ch] text-lg text-fg-muted">{t(`features.${key}Body`)}</p>
                  <ul className="mt-6 flex flex-col gap-3">
                    {splitList(t(`features.${key}Points`)).map((point) => (
                      <li key={point} className="flex gap-3">
                        <Check aria-hidden="true" className="mt-1 size-5 shrink-0 text-success" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <Animation id={animation} locale={locale} className="w-full max-w-md justify-self-center" />
              </section>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="modules-title" className={`${container} py-14 sm:py-16`}>
        <h2 id="modules-title" className={sectionTitle}>
          {t("features.modulesTitle")}
        </h2>
        <p className="mt-4 max-w-[60ch] text-lg text-fg-muted">{t("features.modulesLead")}</p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((key) => (
            <li key={key} id={key} className={`${card} flex flex-col gap-2`}>
              <h3 className="text-xl font-bold">{t(`modules.${key}Title`)}</h3>
              <p className="text-fg-muted">{t(`modules.${key}Body`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-border bg-surface py-14 sm:py-16">
        <div className={`${container} flex flex-col gap-8`}>
          <CtaGroup locale={locale} />
          <StoreLinks locale={locale} />
        </div>
      </section>
    </>
  );
}
