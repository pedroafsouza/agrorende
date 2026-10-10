/**
 * Tiny navigation-start bus. Next.js calls `onRouterTransitionStart` from
 * `src/instrumentation-client.ts` for links, `router.push`/`replace` and back/forward; the
 * route progress provider also feeds it from a document click listener so it works even where
 * the instrumentation hook is unavailable. Listeners are idempotent, so duplicate starts are safe.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function onNavigationStart(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True when `href` points at a different path or query string of this same origin. */
export function isInternalNavigation(href: string, current: Location = window.location): boolean {
  let target: URL;
  try {
    target = new URL(href, current.href);
  } catch {
    return false;
  }
  if (target.origin !== current.origin) return false;
  return target.pathname !== current.pathname || target.search !== current.search;
}

export function emitNavigationStart(href?: string): void {
  if (href !== undefined && typeof window !== "undefined" && !isInternalNavigation(href)) return;
  for (const listener of listeners) listener();
}

/** Whether a click on an anchor will become a client-side navigation Next.js handles. */
export function navigationFromClick(event: MouseEvent): string | null {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const anchor = target.closest("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (anchor.hasAttribute("download")) return null;
  const rel = anchor.getAttribute("target");
  if (rel !== null && rel !== "" && rel !== "_self") return null;
  const href = anchor.getAttribute("href") ?? "";
  return isInternalNavigation(href) ? href : null;
}
