import { Text as NativeText, StyleSheet, type TextProps as NativeTextProps } from "react-native";

import type { MessageKey } from "../i18n/messages";
import { message } from "../i18n/messages";
import { defaultTheme } from "./theme";

type TextProps = Omit<NativeTextProps, "children"> & { readonly i18nKey: MessageKey; readonly tone?: "body" | "secondary" | "inverse" };

export function Text({ i18nKey, tone = "body", style, ...props }: TextProps) {
  return <NativeText {...props} style={[styles.base, styles[tone], style]}>{message(i18nKey)}</NativeText>;
}

const styles = StyleSheet.create({
  base: { color: defaultTheme.text, fontSize: 17, lineHeight: 24 },
  body: { color: defaultTheme.text },
  secondary: { color: defaultTheme.textSecondary },
  inverse: { color: "#FFFFFF" },
});
