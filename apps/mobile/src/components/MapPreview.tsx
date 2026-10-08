import { notImplemented } from "../lib/notImplemented";

export type MapDestination = { readonly lat: number; readonly lng: number; readonly label: string } | { readonly query: string; readonly label: string };
export type MapPreviewProps = { readonly destination: MapDestination; readonly onOpenNavigation?: (destination: MapDestination) => void };
export function MapPreview(_props: MapPreviewProps): never { return notImplemented("components.MapPreview"); }
