import type { LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";

import type { MessageKey } from "../i18n/messages";
import { Icon } from "./Icon";
import { Text } from "./Text";
import { minTouchTarget, radius, statusTone, useTheme, type StatusTone } from "./theme";

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
  return (
    <View testID={testID} accessibilityRole="radiogroup" style={[styles.row, { borderColor: theme.border, borderWidth: Math.max(1, theme.borderWidth) }]}>
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
            style={[styles.option, { minHeight: large ? 64 : minTouchTarget, backgroundColor: bg }, selected && tone !== undefined && { borderColor: tone.color, borderWidth: 2 }]}
          >
            {option.icon === undefined ? null : <Icon icon={option.icon} color={fg} />}
            <Text i18nKey={option.labelKey} color={fg} variant="label" numberOfLines={1} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { borderRadius: radius.controls, flexDirection: "row", overflow: "hidden" },
  option: { alignItems: "center", flex: 1, flexDirection: "row", gap: 6, justifyContent: "center", paddingHorizontal: 8 },
});
