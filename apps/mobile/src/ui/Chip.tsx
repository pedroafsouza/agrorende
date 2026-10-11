import type { LucideIcon } from "lucide-react-native";
import { Check } from "lucide-react-native";
import { Pressable, StyleSheet } from "react-native";

import type { MessageKey } from "../i18n/messages";
import { Icon } from "./Icon";
import { Text } from "./Text";
import { minTouchTarget, space, useTheme } from "./theme";

export type ChipProps = { readonly labelKey?: MessageKey; /** Data text (e.g. a localized checklist option), used when there is no key. */ readonly label?: string; readonly selected?: boolean; readonly onPress?: () => void; readonly icon?: LucideIcon; readonly testID?: string };

export function Chip({ labelKey, label, selected = false, onPress, icon, testID }: ChipProps) {
  const theme = useTheme();
  const fg = selected ? theme.onPrimary : theme.text;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.base, { backgroundColor: selected ? theme.primary : theme.surfaceRaised, borderColor: selected ? theme.primary : theme.border, borderWidth: Math.max(1, theme.borderWidth) }]}
    >
      {selected ? <Icon icon={Check} size={18} color={fg} /> : icon === undefined ? null : <Icon icon={icon} size={18} color={fg} />}
      {labelKey === undefined ? (
        <Text color={fg} variant="label">
          {label}
        </Text>
      ) : (
        <Text i18nKey={labelKey} color={fg} variant="label" />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({ base: { alignItems: "center", borderRadius: 999, flexDirection: "row", gap: space[2], minHeight: minTouchTarget, paddingHorizontal: space[4] } });
