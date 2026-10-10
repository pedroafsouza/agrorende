/**
 * Web stand-in for `react-native-maps` (development web preview only).
 *
 * react-native-maps has no web implementation, so `metro.config.cjs` resolves the package to this
 * file when the platform is `web`. It draws a quiet, static "fields and roads" backdrop and places
 * the markers proportionally inside the visible region. Native builds never load this file.
 */
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

export type LatLng = { readonly latitude: number; readonly longitude: number };
export type Region = LatLng & { readonly latitudeDelta: number; readonly longitudeDelta: number };

type MapViewProps = {
  readonly style?: StyleProp<ViewStyle>;
  readonly initialRegion?: Region;
  readonly region?: Region;
  readonly children?: ReactNode;
  readonly onMapLoaded?: () => void;
  readonly testID?: string;
  readonly [prop: string]: unknown;
};

type MarkerProps = {
  readonly coordinate: LatLng;
  readonly title?: string;
  readonly description?: string;
  readonly pinColor?: string;
  readonly testID?: string;
  readonly accessibilityLabel?: string;
  readonly onPress?: () => void;
  readonly [prop: string]: unknown;
};

const RegionContext = createContext<Region | undefined>(undefined);

const BACKDROP = [
  "linear-gradient(115deg, transparent 47%, #f3efe4 47%, #f3efe4 49.5%, transparent 49.5%)",
  "linear-gradient(20deg, transparent 62%, #f3efe4 62%, #f3efe4 63.8%, transparent 63.8%)",
  "repeating-linear-gradient(115deg, rgba(43,138,62,0.10) 0 22px, rgba(43,138,62,0.04) 22px 44px)",
  "radial-gradient(circle at 78% 22%, #cfe3c4 0 14%, transparent 15%)",
  "radial-gradient(circle at 18% 75%, #e8dcc0 0 18%, transparent 19%)",
  "linear-gradient(180deg, #e3eedb, #dbe8d0)",
].join(", ");

export default function MapView({ style, initialRegion, region, children, onMapLoaded, testID }: MapViewProps) {
  useEffect(() => {
    onMapLoaded?.();
  }, [onMapLoaded]);
  const visible = region ?? initialRegion;
  return (
    <View testID={testID} style={[styles.map, style]}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: BACKDROP }} />
      <RegionContext.Provider value={visible}>{children}</RegionContext.Provider>
    </View>
  );
}

export function Marker({ coordinate, title, pinColor = "#C92A2A", testID, accessibilityLabel, onPress }: MarkerProps) {
  const visible = useContext(RegionContext);
  const x = visible === undefined ? 0.5 : 0.5 + (coordinate.longitude - visible.longitude) / Math.max(visible.longitudeDelta, 1e-6);
  const y = visible === undefined ? 0.5 : 0.5 - (coordinate.latitude - visible.latitude) / Math.max(visible.latitudeDelta, 1e-6);
  const left = `${Math.min(0.94, Math.max(0.06, x)) * 100}%` as const;
  const top = `${Math.min(0.92, Math.max(0.1, y)) * 100}%` as const;
  return (
    <Pressable testID={testID} accessibilityLabel={accessibilityLabel ?? title} onPress={onPress} style={[styles.marker, { left, top }]}>
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: "50% 50% 50% 0",
          transform: "rotate(-45deg)",
          background: pinColor,
          border: "3px solid #ffffff",
          boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
        }}
      />
    </Pressable>
  );
}

export const Callout = ({ children }: { readonly children?: ReactNode }) => <>{children}</>;
export const PROVIDER_GOOGLE = "google";
export const PROVIDER_DEFAULT = undefined;

const styles = StyleSheet.create({
  map: { backgroundColor: "#dbe8d0", overflow: "hidden" },
  marker: { position: "absolute", marginLeft: -13, marginTop: -30 },
});
