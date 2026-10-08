import { Pressable, StyleSheet, type PressableProps } from "react-native";

import type { MessageKey } from "../i18n/messages";
import { Text } from "./Text";
import { defaultTheme, primaryButtonHeight } from "./theme";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonProps = PressableProps & { readonly labelKey: MessageKey; readonly variant?: ButtonVariant };

export function Button({ labelKey, variant = "primary", style, ...props }: ButtonProps) {
  return (
    <Pressable {...props} style={({ pressed }) => [styles.base, styles[variant], pressed && styles.pressed, typeof style === "function" ? style({ pressed }) : style]}>
      <Text i18nKey={labelKey} tone={variant === "primary" || variant === "danger" ? "inverse" : "body"} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", borderRadius: 8, borderWidth: 2, justifyContent: "center", minHeight: primaryButtonHeight, paddingHorizontal: 20 },
  primary: { backgroundColor: defaultTheme.primary, borderColor: defaultTheme.primary },
  secondary: { backgroundColor: defaultTheme.surfaceRaised, borderColor: defaultTheme.border },
  danger: { backgroundColor: "#B42318", borderColor: "#B42318" },
  ghost: { backgroundColor: "transparent", borderColor: "transparent" },
  pressed: { opacity: 0.86 },
});
