import type { LucideIcon } from "lucide-react-native";
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

import type { MessageKey, MessageValues } from "../i18n/messages";
import { useT } from "../i18n/useT";
import { hapticSuccess } from "./haptics";
import { Icon } from "./Icon";
import { Text } from "./Text";
import { minTouchTarget, primaryButtonHeight, radius, space, useTheme } from "./theme";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export type ButtonProps = Omit<PressableProps, "style" | "children"> & {
  readonly labelKey: MessageKey;
  readonly labelValues?: MessageValues;
  readonly variant?: ButtonVariant;
  readonly icon?: LucideIcon;
  readonly loading?: boolean;
  readonly compact?: boolean;
  /** Fires a success haptic on press (submit actions). */
  readonly haptic?: boolean;
  readonly style?: StyleProp<ViewStyle>;
};

export function Button({ labelKey, labelValues, variant = "primary", icon, loading = false, compact = false, haptic = false, disabled, onPress, style, ...props }: ButtonProps) {
  const theme = useTheme();
  const t = useT();
  const inactive = disabled === true || loading;
  const fill = variant === "primary" ? theme.primary : variant === "danger" ? theme.danger : variant === "secondary" ? theme.surfaceRaised : "transparent";
  const border = variant === "secondary" ? theme.border : fill;
  const fg = variant === "primary" ? theme.onPrimary : variant === "danger" ? theme.onDanger : theme.link;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(labelKey, labelValues)}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={(event) => {
        if (haptic) hapticSuccess();
        onPress?.(event);
      }}
      style={({ pressed }) => [
        styles.base,
        { minHeight: compact ? minTouchTarget : primaryButtonHeight, backgroundColor: pressed && variant === "primary" ? theme.primaryPressed : fill, borderColor: border, borderWidth: Math.max(2, theme.borderWidth) },
        pressed && variant !== "primary" && styles.pressed,
        inactive && styles.disabled,
        style,
      ]}
      {...props}
    >
      <View style={styles.row}>
        {loading ? <ActivityIndicator color={fg} /> : icon === undefined ? null : <Icon icon={icon} color={fg} />}
        <Text i18nKey={labelKey} values={labelValues} variant="button" color={fg} numberOfLines={2} style={styles.label} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", borderRadius: radius.controls, justifyContent: "center", paddingHorizontal: space[4], paddingVertical: space[2] },
  row: { alignItems: "center", flexDirection: "row", gap: space[2], justifyContent: "center" },
  label: { textAlign: "center", flexShrink: 1 },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
});
