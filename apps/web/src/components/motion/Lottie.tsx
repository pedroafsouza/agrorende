"use client";

import { useEffect, useRef } from "react";

import { loadAnimation, motionMeta, type AnimationId } from "@agrorende/motion";

import { cn } from "@/lib/cn";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

export interface LottieProps {
  /** Animation from `@agrorende/motion`. */
  readonly id: AnimationId;
  /** Play a single time even when the animation is designed to loop, then rest on the last frame. */
  readonly playOnce?: boolean;
  readonly className?: string;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION).matches;
}

/**
 * Decorative Lottie player (SIMPLER-TO-SELL §6). The SVG-only `lottie_light` build and the
 * animation JSON load lazily, the box keeps the animation's aspect ratio so nothing shifts,
 * reduced motion shows the poster frame, and animations pause while off screen. Meaning
 * always lives in the text beside it, so the player is hidden from assistive technology.
 */
export function Lottie({ id, playOnce = false, className }: LottieProps) {
  const ref = useRef<HTMLDivElement>(null);
  const meta = motionMeta[id];

  useEffect(() => {
    const container = ref.current;
    if (container === null) return undefined;
    let cancelled = false;
    let cleanup = (): void => undefined;

    void Promise.all([import("lottie-web/build/player/lottie_light"), loadAnimation(id)])
      .then(([module, data]) => {
        if (cancelled) return;
        const animation = module.default.loadAnimation({
          container,
          renderer: "svg",
          loop: !playOnce && meta.loop,
          autoplay: false,
          // lottie-web annotates the data it is given, so every player gets its own copy.
          animationData: structuredClone(data),
          rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
        });
        let finished = false;
        let visible = true;
        const sync = () => {
          if (prefersReducedMotion()) animation.goToAndStop(meta.posterFrame, true);
          else if (visible && !finished) animation.play();
          else animation.pause();
        };
        animation.addEventListener("complete", () => {
          finished = true;
        });

        const media = typeof window.matchMedia === "function" ? window.matchMedia(REDUCED_MOTION) : null;
        media?.addEventListener("change", sync);
        let observer: IntersectionObserver | null = null;
        if (typeof IntersectionObserver === "function") {
          observer = new IntersectionObserver((entries) => {
            visible = entries.some((entry) => entry.isIntersecting);
            sync();
          });
          observer.observe(container);
        }
        sync();

        cleanup = () => {
          observer?.disconnect();
          media?.removeEventListener("change", sync);
          animation.destroy();
        };
      })
      .catch(() => {
        // The animation is decorative: if it cannot load, the reserved box simply stays empty.
      });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [id, meta.loop, meta.posterFrame, playOnce]);

  return (
    <div
      aria-hidden="true"
      className={cn("w-full overflow-hidden rounded-cards bg-[var(--ar-motion-stage,transparent)]", className)}
      data-animation={id}
      data-testid="lottie"
      ref={ref}
      style={{ aspectRatio: `${meta.width} / ${meta.height}` }}
    />
  );
}
