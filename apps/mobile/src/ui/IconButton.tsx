import type { LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet } from "react-native";

import type { MessageKey } from "../i18n/messages";
import { useT } from "../i18n/useT";
import { Icon } from "./Icon";
import { Text } from "./Text";
import { minTouchTarget, radius, space, useTheme } from "./theme";

export type IconButtonProps = {
  readonly icon: LucideIcon;
  readonly labelKey: MessageKey;
  readonly onPress?: () => void;
  readonly disabled?: boolean;
  readonly tone?: "default" | "danger" | "primary";
  readonly testID?: string;
};

/** 48 dp icon button with its visible text label (UX-06). */
export function IconButton({ icon, labelKey, onPress, disabled = false, tone = "default", testID }: IconButtonProps) {
  const theme = useTheme();
  const t = useT();
  const color = tone === "danger" ? theme.danger : tone === "primary" ? theme.link : theme.text;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={t(labelKey)}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [styles.base, pressed && { backgroundColor: theme.surface }, disabled && styles.disabled]}
    >
      <Icon icon={icon} color={color} />
      <Text i18nKey={labelKey} variant="caption" color={color} numberOfLines={1} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", borderRadius: radius.controls, flexDirection: "row", gap: space[1], justifyContent: "center", minHeight: minTouchTarget, minWidth: minTouchTarget, paddingHorizontal: space[2] },
  disabled: { opacity: 0.5 },
});
