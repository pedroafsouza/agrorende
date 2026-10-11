import type { LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";

import type { MessageKey } from "../i18n/messages";
import { Icon } from "./Icon";
import { Text } from "./Text";
import { minTouchTarget, radius, space, statusTone, type StatusTone, useTheme } from "./theme";

export type SegmentedOption<T extends string> = { readonly value: T; readonly labelKey: MessageKey; readonly icon?: LucideIcon; readonly tone?: StatusTone };

export type SegmentedProps<T extends string> = {
  readonly options: readonly SegmentedOption<T>[];
  readonly value: T | undefined;
  readonly onChange: (value: T) => void;
  readonly large?: boolean;
  readonly testID?: string;
};

export function Segmented<T extends string>({ options, value, onChange, large = false, testID }: SegmentedProps<T>) {
  const theme = useTheme();
  // Three or more options stack the icon over a two-line label, and five or more wrap into rows, so labels never truncate.
  const stacked = options.length >= 3;
  const wrapped = options.length >= 5;
  return (
    <View testID={testID} accessibilityRole="radiogroup" style={[styles.row, wrapped && styles.wrapped, { borderColor: theme.border, borderWidth: Math.max(1, theme.borderWidth) }]}>
      {options.map((option) => {
        const selected = option.value === value;
        const tone = option.tone === undefined ? undefined : statusTone(option.tone, theme);
        const bg = selected ? (tone?.backgroundColor ?? theme.primary) : theme.surfaceRaised;
        const fg = selected ? (tone?.onFill ?? theme.onPrimary) : theme.text;
        return (
          <Pressable
            key={option.value}
            testID={testID === undefined ? undefined : `${testID}-${option.value}`}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.option, stacked && styles.stacked, wrapped && styles.cell, { minHeight: large ? 64 : minTouchTarget, backgroundColor: bg }, selected && tone !== undefined && { borderColor: tone.color, borderWidth: 2 }]}
          >
            {option.icon === undefined ? null : <Icon icon={option.icon} color={fg} />}
            <Text i18nKey={option.labelKey} color={fg} variant="label" numberOfLines={stacked ? 2 : 1} style={styles.label} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { borderRadius: radius.controls, flexDirection: "row", overflow: "hidden" },
  wrapped: { flexWrap: "wrap" },
  option: { alignItems: "center", flex: 1, flexDirection: "row", gap: space[2], justifyContent: "center", paddingHorizontal: space[2] },
  stacked: { flexDirection: "column", gap: space[1], paddingHorizontal: space[1], paddingVertical: space[2] },
  cell: { flexBasis: "33.33%", flexGrow: 1 },
  label: { flexShrink: 1, textAlign: "center" },
});
