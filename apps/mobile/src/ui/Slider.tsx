import { Pressable, StyleSheet, View } from "react-native";

import type { MessageKey } from "../i18n/messages";
import { useT } from "../i18n/useT";
import { Text } from "./Text";
import { minTouchTarget, space, useTheme } from "./theme";

export type SliderProps = {
  readonly labelKey: MessageKey;
  /** Discrete level, `0..steps` (fuel uses eighths). */
  readonly value: number | undefined;
  readonly steps?: number;
  readonly onChange: (value: number) => void;
  readonly testID?: string;
};

/** Stepped level picker (fuel gauge): big discrete targets instead of a fiddly thumb. */
export function Slider({ labelKey, value, steps = 8, onChange, testID }: SliderProps) {
  const theme = useTheme();
  const t = useT();
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text i18nKey={labelKey} variant="label" />
        <Text i18nKey="ui.slider.value" values={{ value: value ?? 0, steps }} tone="secondary" />
      </View>
      <View style={styles.track} accessibilityRole="adjustable" accessibilityLabel={t(labelKey)} accessibilityValue={{ min: 0, max: steps, now: value ?? 0 }}>
        {Array.from({ length: steps + 1 }, (_, i) => (
          <Pressable
            key={i}
            testID={testID === undefined ? undefined : `${testID}-${i}`}
            accessibilityRole="button"
            accessibilityLabel={t("ui.slider.value", { value: i, steps })}
            onPress={() => onChange(i)}
            style={[styles.cell, { backgroundColor: value !== undefined && i <= value ? theme.primary : theme.surface, borderColor: theme.border }]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[2] },
  head: { flexDirection: "row", justifyContent: "space-between" },
  track: { flexDirection: "row", gap: space[1] },
  cell: { borderRadius: 4, borderWidth: 1, flex: 1, minHeight: minTouchTarget },
});
