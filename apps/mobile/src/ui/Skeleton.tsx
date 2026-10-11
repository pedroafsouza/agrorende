import { StyleSheet, View } from "react-native";

import { useT } from "../i18n/useT";
import { radius, space, useTheme } from "./theme";

export type SkeletonProps = { readonly lines?: number; readonly height?: number };

/** Static placeholder (no shimmer, so reduced-motion users see the same thing). */
export function Skeleton({ lines = 3, height = 20 }: SkeletonProps) {
  const theme = useTheme();
  const t = useT();
  return (
    <View testID="skeleton" accessibilityRole="progressbar" accessibilityLabel={t("ui.loading")} style={styles.wrap}>
      {Array.from({ length: lines }, (_, i) => (
        <View key={i} style={[styles.line, { height, backgroundColor: theme.surface, borderColor: theme.border, width: i === lines - 1 ? "60%" : "100%" }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { gap: space[3] }, line: { borderRadius: radius.controls, borderWidth: StyleSheet.hairlineWidth } });
