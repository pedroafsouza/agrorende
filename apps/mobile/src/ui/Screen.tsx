import type { ReactNode } from "react";
import { RefreshControl, ScrollView, StyleSheet, View, type ViewProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "./theme";

export type ScreenProps = ViewProps & {
  readonly scroll?: boolean;
  /** Fixed bottom area for the one primary action. */
  readonly footer?: ReactNode;
  readonly banner?: ReactNode;
  readonly refreshing?: boolean;
  readonly onRefresh?: () => void;
};

export function Screen({ children, style, scroll = true, footer, banner, refreshing, onRefresh, ...props }: ScreenProps) {
  const theme = useTheme();
  return (
    <SafeAreaView edges={["bottom", "left", "right"]} {...props} style={[styles.safe, { backgroundColor: theme.background }, style]}>
      {banner}
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh === undefined ? undefined : <RefreshControl refreshing={refreshing === true} onRefresh={onRefresh} />}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.fill]}>{children}</View>
      )}
      {footer === undefined ? null : <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.background }]}>{footer}</View>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { gap: 16, padding: 16 },
  fill: { flex: 1 },
  footer: { borderTopWidth: 1, gap: 8, padding: 16 },
});
