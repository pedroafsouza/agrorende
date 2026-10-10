import type { DevicePrefs } from "../../lib/app/prefs";

export type FirstRunRoute = "/intro" | "/onboarding" | "/today";

/**
 * Where a technician goes after signing in: the three-card introduction once, then the
 * permission explanations once (PLT-14), then Hoje.
 */
export function firstRunRoute(prefs: DevicePrefs): FirstRunRoute {
  if (prefs.introSeen !== true) return "/intro";
  if (prefs.onboarded !== true) return "/onboarding";
  return "/today";
}
