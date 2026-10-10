"use client";

import { type AnimationId, loadAnimation, motionMeta } from "@agrorende/motion/lazy";
import { useEffect, useRef, useState } from "react";

/** Looping animations that run longer than this get a pause button (WCAG 2.2.2). */
export const PAUSE_CONTROL_AFTER_MS = 5000;

export interface LottieLabels {
  pause: string;
  play: string;
}

export interface LottieProps {
  id: AnimationId;
  /** Accessible names for the pause and play button. */
  labels: LottieLabels;
  className?: string;
  /** Overrides the loop flag from `motionMeta`. */
  loop?: boolean;
  /** Plays once when it first scrolls into view and then rests on the last frame. */
  playOnce?: boolean;
}

interface Player {
  play(): void;
  pause(): void;
  goToAndStop(value: number, isFrame?: boolean): void;
  addEventListener(name: "complete", callback: () => void): unknown;
  destroy(): void;
}

/**
 * A long animation loops forever, so every looping animation counts as longer than five seconds.
 * A short one-off animation does not need the control.
 */
export function needsPauseControl(loop: boolean, durationMs: number): boolean {
  return loop || durationMs > PAUSE_CONTROL_AFTER_MS;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function liteMode(): boolean {
  return document.documentElement.dataset.lite === "on";
}

/**
 * A decorative Lottie animation from `@agrorende/motion`. The player and the animation data load
 * lazily after hydration; the light SVG player needs no `unsafe-eval` in the site CSP. A fixed
 * aspect-ratio box keeps the layout still while it loads.
 */
export function Lottie({ id, labels, className, loop, playOnce = false }: LottieProps) {
  const meta = motionMeta[id];
  const shouldLoop = playOnce ? false : (loop ?? meta.loop);
  const hasControl = !playOnce && needsPauseControl(shouldLoop, meta.durationMs);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const visibleRef = useRef(false);
  const pausedRef = useRef(false);
  const doneRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let observer: IntersectionObserver | undefined;
    let liteObserver: MutationObserver | undefined;
    const reduced = prefersReducedMotion();

    const sync = () => {
      const player = playerRef.current;
      if (!player || reduced) return;
      if (visibleRef.current && !pausedRef.current && !doneRef.current) player.play();
      else player.pause();
    };

    const start = async () => {
      const [lottieModule, animationData] = await Promise.all([
        import("lottie-web/build/player/lottie_light"),
        loadAnimation(id),
      ]);
      if (cancelled) return;
      const player: Player = lottieModule.default.loadAnimation({
        container,
        renderer: "svg",
        loop: shouldLoop,
        autoplay: false,
        animationData,
        rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
      });
      playerRef.current = player;
      if (reduced) {
        player.goToAndStop(meta.posterFrame, true);
        setStill(true);
      } else {
        if (playOnce) player.addEventListener("complete", () => (doneRef.current = true));
        if (typeof IntersectionObserver === "function") {
          observer = new IntersectionObserver((entries) => {
            visibleRef.current = entries.some((entry) => entry.isIntersecting);
            sync();
          }, { threshold: 0.25 });
          observer.observe(container);
        } else {
          visibleRef.current = true;
          sync();
        }
      }
      setReady(true);
    };

    const begin = () => {
      start().catch(() => {
        // The stage stays empty; the animation is decorative, so the page keeps working.
      });
    };

    if (liteMode()) {
      liteObserver = new MutationObserver(() => {
        if (liteMode()) return;
        liteObserver?.disconnect();
        begin();
      });
      liteObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-lite"] });
    } else {
      begin();
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
      liteObserver?.disconnect();
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [id, shouldLoop, playOnce, meta.posterFrame]);

  const toggle = () => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    const player = playerRef.current;
    if (!player) return;
    if (next) player.pause();
    else if (visibleRef.current) player.play();
  };

  return (
    <div
      className={`motion-stage ${className ?? ""}`}
      data-animation={id}
      data-decorative="true"
      data-ready={ready ? "true" : "false"}
      style={{ aspectRatio: `${meta.width} / ${meta.height}` }}
    >
      <div ref={containerRef} aria-hidden="true" className="absolute inset-0" />
      {hasControl && ready && !still ? (
        <button className="motion-toggle" data-motion-toggle onClick={toggle} type="button">
          {paused ? <PlayIcon /> : <PauseIcon />}
          <span className="sr-only">{paused ? labels.play : labels.pause}</span>
        </button>
      ) : null}
    </div>
  );
}

function PauseIcon() {
  return (
    <svg aria-hidden="true" fill="currentColor" height="20" viewBox="0 0 24 24" width="20">
      <rect height="16" rx="1" width="4" x="6" y="4" />
      <rect height="16" rx="1" width="4" x="14" y="4" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg aria-hidden="true" fill="currentColor" height="20" viewBox="0 0 24 24" width="20">
      <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z" />
    </svg>
  );
}
