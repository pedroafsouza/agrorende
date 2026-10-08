import { Linking, Platform } from "react-native";

import { LocalError } from "./errors";

export type NavigationDestination = { readonly lat: number; readonly lng: number; readonly label: string } | { readonly query: string; readonly label: string };
export type NavigationApp = "apple" | "google" | "waze" | "system";
export type NavigationPlatform = "ios" | "android";

/** Accepts a work order / site / anything with coordinates or an address. */
export function resolveDestination(
  input: NavigationDestination | { readonly lat?: number | null; readonly lng?: number | null; readonly address?: string | null; readonly label?: string | null; readonly name?: string | null },
): NavigationDestination {
  if ("query" in input && typeof input.query === "string") return input;
  const source = input as { lat?: number | null; lng?: number | null; address?: string | null; label?: string | null; name?: string | null };
  const label = source.label ?? source.name ?? source.address ?? "";
  if (typeof source.lat === "number" && typeof source.lng === "number") return { lat: source.lat, lng: source.lng, label };
  if (typeof source.address === "string" && source.address.length > 0) return { query: source.address, label };
  throw new LocalError("NAV_DESTINATION_DOUBTFUL");
}

function target(destination: NavigationDestination): string {
  return "lat" in destination ? `${destination.lat},${destination.lng}` : encodeURIComponent(destination.query);
}

export function fallbackNavigationUrl(destination: NavigationDestination): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${target(destination)}&travelmode=driving`;
}

/** URL table of ARCHITECTURE §13.5. */
export function navigationUrl(destination: NavigationDestination, app: NavigationApp, platform: NavigationPlatform = Platform.OS === "ios" ? "ios" : "android"): string {
  const dest = target(destination);
  switch (app) {
    case "apple":
      return platform === "ios" ? `maps://?daddr=${dest}&dirflg=d` : fallbackNavigationUrl(destination);
    case "google":
      return platform === "ios" ? `comgooglemaps://?daddr=${dest}&directionsmode=driving` : `google.navigation:q=${dest}&mode=d`;
    case "waze":
      return "lat" in destination ? `waze://?ll=${dest}&navigate=yes` : `waze://?q=${dest}&navigate=yes`;
    case "system":
      if (platform === "android") return "lat" in destination ? `geo:${dest}?q=${dest}(${encodeURIComponent(destination.label)})` : `geo:0,0?q=${dest}`;
      return `maps://?daddr=${dest}&dirflg=d`;
  }
}

export const NAVIGATION_APPS: Readonly<Record<NavigationPlatform, readonly NavigationApp[]>> = { ios: ["apple", "google", "waze"], android: ["system", "google", "waze"] };

/** Installed navigation apps for the first-use chooser (`Linking.canOpenURL`). */
export async function availableNavigationApps(platform: NavigationPlatform = Platform.OS === "ios" ? "ios" : "android"): Promise<NavigationApp[]> {
  const probe: NavigationDestination = { lat: 0, lng: 0, label: "" };
  const result: NavigationApp[] = [];
  for (const app of NAVIGATION_APPS[platform]) {
    if (app === "apple" || app === "system") {
      result.push(app);
      continue;
    }
    const ok = await Linking.canOpenURL(navigationUrl(probe, app, platform)).catch(() => false);
    if (ok) result.push(app);
  }
  return result;
}

/** Opens turn-by-turn navigation; any failure falls back to the HTTPS URL (never a dead end). */
export async function openNavigation(destination: NavigationDestination, app: NavigationApp = "system"): Promise<"app" | "fallback"> {
  try {
    await Linking.openURL(navigationUrl(destination, app));
    return "app";
  } catch (_error) {
    await Linking.openURL(fallbackNavigationUrl(destination));
    return "fallback";
  }
}
