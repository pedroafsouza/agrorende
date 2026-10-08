import { View, StyleSheet, type ViewProps } from "react-native";

import { defaultTheme } from "./theme";

export function Card({ children, style, ...props }: ViewProps) {
  return <View {...props} style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({ card: { backgroundColor: defaultTheme.surfaceRaised, borderColor: defaultTheme.border, borderRadius: 12, borderWidth: 1, padding: 16 } });
