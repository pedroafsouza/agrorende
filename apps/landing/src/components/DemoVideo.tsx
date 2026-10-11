import { preload } from "react-dom";

import { DEMO_VIDEO_FILES, type DemoVideoAssets } from "@/lib/demoVideo";
import { type SiteLocale } from "@/lib/locales";
import { getTranslator } from "@/i18n/messages";

/** Captioned product video that downloads nothing until the visitor presses play. */
export function DemoVideo({
  locale,
  assets,
  className = "",
}: {
  readonly locale: SiteLocale;
  readonly assets: DemoVideoAssets;
  readonly className?: string;
}) {
  const t = getTranslator(locale);
  // The poster is the page's largest paint; fetch it early instead of after the video tag parses.
  if (assets.poster) preload(DEMO_VIDEO_FILES.poster, { as: "image", fetchPriority: "high" });
  return (
    <video
      className={`aspect-video w-full rounded-[16px] border border-border bg-graphite-950 ${className}`}
      controls
      preload="none"
      poster={assets.poster ? DEMO_VIDEO_FILES.poster : undefined}
      data-video="demo"
    >
      <source src={DEMO_VIDEO_FILES.src} type="video/mp4" />
      {assets.captions ? <track kind="captions" srcLang="pt-BR" src={DEMO_VIDEO_FILES.captions} label={t("features.captions")} default /> : null}
      <p>
        {t("features.videoUnsupported")}{" "}
        <a className="prose-link" href={DEMO_VIDEO_FILES.src}>
          {t("features.videoDownload")}
        </a>
      </p>
    </video>
  );
}
