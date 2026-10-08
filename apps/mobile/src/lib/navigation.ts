import { Linking } from "react-native";

export type NavigationDestination = { readonly lat: number; readonly lng: number; readonly label: string } | { readonly query: string; readonly label: string };
export type NavigationApp = "apple" | "google" | "waze" | "system";

function encodeDestination(destination: NavigationDestination): string {
  return "lat" in destination ? `${destination.lat},${destination.lng}` : encodeURIComponent(destination.query);
}

export function resolveDestination(destination: NavigationDestination): NavigationDestination {
  return destination;
}

export async function openNavigation(destination: NavigationDestination, app: NavigationApp = "system"): Promise<void> {
  const target = encodeDestination(destination);
  const url = app === "waze" && "lat" in destination ? `waze://?ll=${target}&navigate=yes` : `https://www.google.com/maps/dir/?api=1&destination=${target}&travelmode=driving`;
  await Linking.openURL(url);
}
