import { emitNavigationStart } from "@/components/feedback/routeEvents";

/** Next.js client instrumentation: every router transition starts the admin route progress bar. */
export function onRouterTransitionStart(url: string): void {
  emitNavigationStart(url);
}
