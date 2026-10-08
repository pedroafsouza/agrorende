import { Navigation } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker } from "react-native-maps";

import { openNavigation, type NavigationApp, type NavigationDestination } from "../lib/navigation";
import { Button, Card, Text, useTheme } from "../ui";
import { Banner } from "../ui/Banner";

export type MapDestination = NavigationDestination;
export type MapMarkerShape = "asset" | "site" | "job" | "person";
export type MapMarker = { readonly id: string; readonly lat: number; readonly lng: number; readonly label: string; readonly shape?: MapMarkerShape };
export type MapPreviewProps = {
  readonly destination: MapDestination;
  readonly markers?: readonly MapMarker[];
  readonly navApp?: NavigationApp;
  readonly onOpenNavigation?: (destination: MapDestination) => void;
  readonly height?: number;
};

/** No tiles after this long (offline, no cache) → MAP_TILES_UNAVAILABLE fallback card. */
export const MAP_LOAD_TIMEOUT_MS = 8_000;

const SHAPE_COLOR: Readonly<Record<MapMarkerShape, "primary" | "link" | "danger" | "accent">> = { asset: "primary", site: "link", job: "danger", person: "accent" };

/** Small static-feeling map with a Navigate action; tiles failing offline fall back to the address card. */
export function MapPreview({ destination, markers = [], navApp, onOpenNavigation, height = 180 }: MapPreviewProps) {
  const theme = useTheme();
  const [tilesFailed, setTilesFailed] = useState(false);
  const loaded = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!loaded.current) setTilesFailed(true);
    }, MAP_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);
  const hasCoords = "lat" in destination;
  const navigate = () => {
    if (onOpenNavigation !== undefined) onOpenNavigation(destination);
    else openNavigation(destination, navApp).catch(() => undefined);
  };
  return (
    <Card testID="map-preview">
      {hasCoords && !tilesFailed ? (
        <View style={[styles.map, { height }]}>
          <MapView
            style={StyleSheet.absoluteFill}
            initialRegion={{ latitude: destination.lat, longitude: destination.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
            scrollEnabled={false}
            zoomEnabled={false}
            pitchEnabled={false}
            rotateEnabled={false}
            toolbarEnabled={false}
            onMapLoaded={() => {
              loaded.current = true;
              setTilesFailed(false);
            }}
          >
            <Marker coordinate={{ latitude: destination.lat, longitude: destination.lng }} title={destination.label} pinColor={theme.danger} />
            {markers.map((m) => (
              <Marker key={m.id} coordinate={{ latitude: m.lat, longitude: m.lng }} title={m.label} pinColor={theme[SHAPE_COLOR[m.shape ?? "asset"]]} />
            ))}
          </MapView>
        </View>
      ) : null}
      {hasCoords && tilesFailed ? <Banner tone="offline" titleKey="errors.MAP_TILES_UNAVAILABLE.title" bodyKey="errors.MAP_TILES_UNAVAILABLE.body" /> : null}
      <Text variant="label">{destination.label}</Text>
      {"query" in destination ? <Text tone="secondary">{destination.query}</Text> : null}
      <Button testID="map-navigate" icon={Navigation} labelKey="ui.map.navigate" onPress={navigate} />
    </Card>
  );
}

const styles = StyleSheet.create({ map: { borderRadius: 12, overflow: "hidden" } });
