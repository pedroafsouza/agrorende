import { StyleSheet, View } from "react-native";

import { Text } from "../../ui";

const SHAPES: Readonly<Record<string, { readonly aspect: number; readonly hintKey: string }>> = {
  WALKAROUND_FRONT: { aspect: 1.2, hintKey: "media.silhouette.front" },
  WALKAROUND_REAR: { aspect: 1.2, hintKey: "media.silhouette.rear" },
  WALKAROUND_LEFT: { aspect: 2, hintKey: "media.silhouette.left" },
  WALKAROUND_RIGHT: { aspect: 2, hintKey: "media.silhouette.right" },
  WALKAROUND_CAB: { aspect: 1, hintKey: "media.silhouette.cab" },
  HOUR_METER: { aspect: 1.6, hintKey: "media.silhouette.hourMeter" },
  FUEL_GAUGE: { aspect: 1, hintKey: "media.silhouette.fuelGauge" },
};

/** Framing guide drawn over the camera preview for walkaround and gauge shots. */
export function Silhouette({ tag }: { readonly tag: string }) {
  const shape = SHAPES[tag];
  if (shape === undefined) return null;
  return (
    <View pointerEvents="none" style={styles.overlay} testID={`silhouette-${tag}`}>
      <View style={[styles.frame, { aspectRatio: shape.aspect }]} />
      <Text i18nKey={shape.hintKey} color="#FFFFFF" variant="label" style={styles.hint} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderColor: "#FFFFFF", borderRadius: 12, borderStyle: "dashed", borderWidth: 3, width: "80%" },
  hint: { backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 8, overflow: "hidden", paddingHorizontal: 12, paddingVertical: 6 },
  overlay: { alignItems: "center", gap: 12, inset: 0, justifyContent: "center", position: "absolute" },
});
