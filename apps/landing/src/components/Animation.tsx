import { type AnimationId } from "@agrorende/motion";

import { type SiteLocale } from "@/lib/locales";
import { getTranslator } from "@/i18n/messages";

import { Lottie } from "./Lottie";

/** Server wrapper that resolves the pause and play labels for <Lottie>. */
export function Animation({
  id,
  locale,
  className,
  loop,
  playOnce,
}: {
  readonly id: AnimationId;
  readonly locale: SiteLocale;
  readonly className?: string;
  readonly loop?: boolean;
  readonly playOnce?: boolean;
}) {
  const t = getTranslator(locale);
  return (
    <Lottie
      id={id}
      className={className}
      loop={loop}
      playOnce={playOnce}
      labels={{ pause: t("motion.pause"), play: t("motion.play") }}
    />
  );
}
