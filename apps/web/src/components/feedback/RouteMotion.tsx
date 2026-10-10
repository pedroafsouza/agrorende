"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { createContext, Suspense, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import "./feedback.css";

import { emitNavigationStart, navigationFromClick, onNavigationStart } from "./routeEvents";

/** Navigations faster than this never show the bar, so quick hops do not flicker. */
export const PROGRESS_DELAY_MS = 120;
/** A navigation that never commits (aborted, failed) still clears the bar after this. */
export const PROGRESS_SAFETY_MS = 15_000;
/** Longest the View Transitions API may hold the old frame while waiting for the new route. */
export const VIEW_TRANSITION_CAP_MS = 200;
export const PAGE_ENTER_MS = 180;
const TRICKLE_MS = 250;
const FILL_MS = 180;
const FADE_MS = 200;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const PAGE_ENTER_KEYFRAMES: Keyframe[] = [
  { opacity: 0, transform: "translateY(6px)" },
  { opacity: 1, transform: "translateY(0)" },
];
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION).matches;
}

type Phase = "idle" | "running" | "done";

interface RouteProgressApi {
  /** Start the bar for a navigation the click listener and the router hook cannot see. */
  readonly start: () => void;
  readonly done: () => void;
}

const RouteProgressContext = createContext<RouteProgressApi>({ start: () => undefined, done: () => undefined });

export function useRouteProgress(): RouteProgressApi {
  return useContext(RouteProgressContext);
}

interface PendingTransition {
  resolve: () => void;
  expired: boolean;
  skip?: () => void;
}

interface ViewTransitionHandle {
  readonly skipTransition?: () => void;
  readonly ready?: Promise<unknown>;
  readonly finished?: Promise<unknown>;
  readonly updateCallbackDone?: Promise<unknown>;
}

type StartViewTransition = (update: () => Promise<void>) => ViewTransitionHandle | undefined;

/** A skipped transition rejects its promises with an AbortError; that is expected, not a failure. */
function settleQuietly(transition: ViewTransitionHandle | undefined): void {
  if (transition === undefined) return;
  for (const promise of [transition.ready, transition.finished, transition.updateCallbackDone]) {
    promise?.catch(() => undefined);
  }
}

function viewTransitionApi(): StartViewTransition | null {
  if (typeof document === "undefined") return null;
  const start = (document as Document & { startViewTransition?: StartViewTransition }).startViewTransition;
  return typeof start === "function" ? start.bind(document) : null;
}

/** Fade and 6 px rise on the page wrapper, through the Web Animations API or the CSS fallback. */
function animatePageEnter(element: HTMLElement | null): void {
  if (element === null) return;
  if (typeof element.animate === "function") {
    element.animate(PAGE_ENTER_KEYFRAMES, { duration: PAGE_ENTER_MS, easing: EASE_OUT });
    return;
  }
  element.removeAttribute("data-entering");
  // Reading layout restarts the CSS animation on the same element.
  void element.offsetWidth;
  element.setAttribute("data-entering", "true");
}

function RouteChangeListener({ onChange }: { readonly onChange: () => void }) {
  const pathname = usePathname();
  const search = useSearchParams()?.toString() ?? "";
  const key = `${pathname}?${search}`;
  const previous = useRef(key);
  useLayoutEffect(() => {
    if (previous.current === key) return;
    previous.current = key;
    onChange();
  }, [key, onChange]);
  return null;
}

/**
 * Route feedback for the admin content area (PAGE-MOTION): a thin progress bar that appears only
 * when a navigation takes longer than 120 ms, and a short fade-and-rise of the page content when
 * the route changes. Navigation is never delayed; with reduced motion nothing moves.
 */
export function RouteMotionProvider({ children }: { readonly children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [anchor, setAnchor] = useState<CSSProperties>({});
  const pageRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(false);
  const visibleRef = useRef(false);
  const transitionRef = useRef<PendingTransition | null>(null);
  const timers = useRef<{ delay?: ReturnType<typeof setTimeout>; safety?: ReturnType<typeof setTimeout>; fade?: ReturnType<typeof setTimeout>; trickle?: ReturnType<typeof setInterval> }>({});

  const clearTimers = useCallback(() => {
    const t = timers.current;
    if (t.delay !== undefined) clearTimeout(t.delay);
    if (t.safety !== undefined) clearTimeout(t.safety);
    if (t.trickle !== undefined) clearInterval(t.trickle);
    timers.current = { fade: t.fade };
  }, []);

  const done = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    clearTimers();
    if (!visibleRef.current) return;
    visibleRef.current = false;
    setPhase("done");
    setProgress(1);
    timers.current.fade = setTimeout(() => {
      setPhase("idle");
      setProgress(0);
    }, FILL_MS + FADE_MS + 20);
  }, [clearTimers]);

  const beginViewTransition = useCallback(() => {
    const startViewTransition = viewTransitionApi();
    if (startViewTransition === null || prefersReducedMotion() || transitionRef.current !== null) return;
    let resolve: () => void = () => undefined;
    const committed = new Promise<void>((r) => {
      resolve = r;
    });
    const pending: PendingTransition = { resolve, expired: false };
    transitionRef.current = pending;
    const cap = new Promise<void>((r) => {
      setTimeout(() => {
        // Too slow to animate old into new: drop the transition instead of animating the old page
        // into itself; the page enter fallback runs when the route finally commits.
        pending.expired = true;
        pending.skip?.();
        r();
      }, VIEW_TRANSITION_CAP_MS);
    });
    try {
      const transition = startViewTransition(() =>
        Promise.race([committed, cap]).finally(() => {
          if (transitionRef.current === pending) transitionRef.current = null;
        }),
      );
      settleQuietly(transition);
      pending.skip = () => transition?.skipTransition?.();
    } catch {
      transitionRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (activeRef.current) return;
    activeRef.current = true;
    if (timers.current.fade !== undefined) clearTimeout(timers.current.fade);
    beginViewTransition();
    timers.current.delay = setTimeout(() => {
      const main = pageRef.current?.closest("main") ?? pageRef.current;
      if (main !== null && main !== undefined) {
        const rect = main.getBoundingClientRect();
        const header = main.parentElement?.querySelector(":scope > header");
        const top = Math.max(rect.top, header?.getBoundingClientRect().bottom ?? 0, 0);
        setAnchor({ top, left: rect.left, width: rect.width });
      }
      visibleRef.current = true;
      setPhase("running");
      setProgress(0.12);
      timers.current.trickle = setInterval(() => {
        setProgress((p) => p + (0.9 - p) * 0.12);
      }, TRICKLE_MS);
    }, PROGRESS_DELAY_MS);
    timers.current.safety = setTimeout(done, PROGRESS_SAFETY_MS);
  }, [beginViewTransition, done]);

  const onRouteChange = useCallback(() => {
    const pending = transitionRef.current;
    const handledByViewTransition = pending !== null && !pending.expired;
    if (pending !== null) {
      pending.resolve();
      transitionRef.current = null;
    }
    done();
    if (!handledByViewTransition && !prefersReducedMotion()) animatePageEnter(pageRef.current);
  }, [done]);

  useEffect(() => {
    const unsubscribe = onNavigationStart(start);
    const onClick = (event: MouseEvent) => {
      const href = navigationFromClick(event);
      if (href !== null) emitNavigationStart(href);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      unsubscribe();
      document.removeEventListener("click", onClick, true);
    };
  }, [start]);

  useEffect(
    () => () => {
      clearTimers();
      if (timers.current.fade !== undefined) clearTimeout(timers.current.fade);
    },
    [clearTimers],
  );

  const api = useMemo(() => ({ start, done }), [start, done]);

  return (
    <RouteProgressContext.Provider value={api}>
      <Suspense fallback={null}>
        <RouteChangeListener onChange={onRouteChange} />
      </Suspense>
      <RouteProgressBar anchor={anchor} phase={phase} progress={progress} />
      <div data-route-page="" onAnimationEnd={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.removeAttribute("data-entering");
        }} ref={pageRef}>
        {children}
      </div>
    </RouteProgressContext.Provider>
  );
}

/** 3 px Campo claro progress line pinned to the top edge of the content area. */
export function RouteProgressBar({ phase, progress, anchor }: { readonly phase: Phase; readonly progress: number; readonly anchor?: CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed z-30 h-[3px] overflow-hidden"
      data-state={phase}
      data-testid="route-progress"
      style={{ top: 0, left: 0, width: "100%", ...anchor, opacity: phase === "running" ? 1 : 0, transition: phase === "done" ? `opacity ${FADE_MS}ms ease-out ${FILL_MS}ms` : "none" }}
    >
      <div
        className="h-full origin-left bg-mata-600 shadow-[0_0_6px_var(--color-mata-400)] transition-transform duration-200 ease-out"
        style={{ transform: `scaleX(${phase === "idle" ? 0 : progress})` }}
      />
    </div>
  );
}
