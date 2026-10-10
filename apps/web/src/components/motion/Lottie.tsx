"use client";

import { Pause, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { loadAnimation, motionMeta, type AnimationId } from "@agrorende/motion/lazy";

import { cn } from "@/lib/cn";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/** Animations that run longer than this get a pause control (WCAG 2.2.2). */
export const PAUSE_CONTROL_AFTER_MS = 5000;

export interface LottieProps {
  /** Animation from `@agrorende/motion`. */
  readonly id: AnimationId;
  /** Play a single time even when the animation is designed to loop, then rest on the last frame. */
  readonly playOnce?: boolean;
  readonly className?: string;
}

/** A looping animation runs forever, so it always counts as longer than five seconds. */
export function needsPauseControl(loop: boolean, durationMs: number): boolean {
  return loop || durationMs > PAUSE_CONTROL_AFTER_MS;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION).matches;
}

interface Player {
  play(): void;
  pause(): void;
  goToAndStop(value: number, isFrame?: boolean): void;
  addEventListener(name: "complete", callback: () => void): unknown;
  destroy(): void;
}

/**
 * Decorative Lottie player (SIMPLER-TO-SELL §6). The SVG-only `lottie_light` build and the
 * animation JSON load lazily, the box keeps the animation's aspect ratio so nothing shifts,
 * reduced motion shows the poster frame, and animations pause while off screen. Looping or
 * long animations get a 48 px pause and play control. Meaning always lives in the text beside
 * it, so the drawing itself is hidden from assistive technology.
 */
export function Lottie({ id, playOnce = false, className }: LottieProps) {
  const t = useTranslations("common");
  const ref = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const visibleRef = useRef(true);
  const pausedRef = useRef(false);
  const finishedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [still, setStill] = useState(false);
  const meta = motionMeta[id];
  const loop = !playOnce && meta.loop;
  const hasControl = !playOnce && needsPauseControl(loop, meta.durationMs);

  useEffect(() => {
    const container = ref.current;
    if (container === null) return undefined;
    let cancelled = false;
    let cleanup = (): void => undefined;

    void Promise.all([import("lottie-web/build/player/lottie_light"), loadAnimation(id)])
      .then(([module, data]) => {
        if (cancelled) return;
        const animation: Player = module.default.loadAnimation({
          container,
          renderer: "svg",
          loop,
          autoplay: false,
          // lottie-web annotates the data it is given, so every player gets its own copy.
          animationData: structuredClone(data),
          rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
        });
        playerRef.current = animation;
        const sync = () => {
          const reduced = prefersReducedMotion();
          setStill(reduced);
          if (reduced) animation.goToAndStop(meta.posterFrame, true);
          else if (visibleRef.current && !finishedRef.current && !pausedRef.current) animation.play();
          else animation.pause();
        };
        animation.addEventListener("complete", () => {
          finishedRef.current = true;
        });

        const media = typeof window.matchMedia === "function" ? window.matchMedia(REDUCED_MOTION) : null;
        media?.addEventListener("change", sync);
        let observer: IntersectionObserver | null = null;
        if (typeof IntersectionObserver === "function") {
          observer = new IntersectionObserver((entries) => {
            visibleRef.current = entries.some((entry) => entry.isIntersecting);
            sync();
          });
          observer.observe(container);
        }
        sync();
        setReady(true);

        cleanup = () => {
          observer?.disconnect();
          media?.removeEventListener("change", sync);
          animation.destroy();
          playerRef.current = null;
        };
      })
      .catch(() => {
        // The animation is decorative: if it cannot load, the reserved box simply stays empty.
      });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [id, loop, meta.posterFrame]);

  const toggle = () => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    const player = playerRef.current;
    if (player === null) return;
    if (next) player.pause();
    else if (visibleRef.current && !finishedRef.current) player.play();
  };

  return (
    <div
      className={cn("relative w-full overflow-hidden rounded-cards bg-[var(--ar-motion-stage,transparent)]", className)}
      data-animation={id}
      data-testid="lottie"
      style={{ aspectRatio: `${meta.width} / ${meta.height}` }}
    >
      <div aria-hidden="true" className="absolute inset-0" data-testid="lottie-canvas" ref={ref} />
      {hasControl && ready && !still ? (
        <button
          aria-label={paused ? t("motion.play") : t("motion.pause")}
          aria-pressed={paused}
          className="absolute right-1 bottom-1 inline-flex size-12 items-center justify-center rounded-full border border-[var(--ar-border-strong)] bg-[var(--ar-surface)] text-[var(--ar-text)] shadow-sm"
          data-motion-toggle
          onClick={toggle}
          type="button"
        >
          {paused ? <Play aria-hidden="true" className="size-5" /> : <Pause aria-hidden="true" className="size-5" />}
        </button>
      ) : null}
    </div>
  );
}
