import { Pressable, StyleSheet, View, type ViewProps } from "react-native";

import { radius, useTheme } from "./theme";

export type CardProps = ViewProps & { readonly onPress?: () => void; readonly accessibilityLabel?: string };

export function Card({ children, style, onPress, ...props }: CardProps) {
  const theme = useTheme();
  const look = [styles.card, { backgroundColor: theme.surfaceRaised, borderColor: theme.border, borderWidth: theme.borderWidth }, style];
  if (onPress === undefined) {
    return (
      <View {...props} style={look}>
        {children}
      </View>
    );
  }
  return (
    <Pressable accessibilityRole="button" onPress={onPress} {...props} style={({ pressed }) => [look, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({ card: { borderRadius: radius.cards, gap: 8, padding: 16 }, pressed: { opacity: 0.85 } });
