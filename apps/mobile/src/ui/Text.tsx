import type { ReactNode } from "react";
import { Text as NativeText, StyleSheet, type TextProps as NativeTextProps } from "react-native";

import type { MessageKey, MessageValues } from "../i18n/messages";
import { useT } from "../i18n/useT";
import { type, useTheme } from "./theme";

export type TextTone = "body" | "secondary" | "inverse" | "primary" | "danger" | "success";
export type TextVariant = "body" | "title" | "heading" | "label" | "caption" | "button" | "display";

export type TextProps = Omit<NativeTextProps, "children"> & {
  /** Translated copy. Use `children` only for user data (names, IDs, readings). */
  readonly i18nKey?: MessageKey;
  readonly values?: MessageValues;
  readonly children?: ReactNode;
  readonly tone?: TextTone;
  readonly variant?: TextVariant;
  readonly color?: string;
};

export function Text({ i18nKey, values, children, tone = "body", variant = "body", color, style, ...props }: TextProps) {
  const t = useT();
  const theme = useTheme();
  const toneColor: Record<TextTone, string> = {
    body: theme.text,
    secondary: theme.textSecondary,
    inverse: theme.onPrimary,
    primary: theme.link,
    danger: theme.danger,
    success: theme.primary,
  };
  return (
    <NativeText maxFontSizeMultiplier={type.maxFontScale} {...props} style={[styles.base, styles[variant], { color: color ?? toneColor[tone] }, style]}>
      {i18nKey === undefined ? children : t(i18nKey, values)}
    </NativeText>
  );
}

const styles = StyleSheet.create({
  base: { fontSize: type.body.fontSize, lineHeight: type.body.lineHeight },
  body: {},
  title: { fontSize: 22, lineHeight: 28, fontWeight: "700" },
  heading: { fontSize: 19, lineHeight: 26, fontWeight: "600" },
  label: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
  caption: { fontSize: 15, lineHeight: 20 },
  button: { fontSize: type.primaryButtonLabel.fontSize, lineHeight: type.primaryButtonLabel.lineHeight, fontWeight: "600" },
  display: { fontSize: 28, lineHeight: 34, fontWeight: "700" },
});
