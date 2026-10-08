import { SafeAreaView, ScrollView, StyleSheet, type ViewProps } from "react-native";

import { defaultTheme } from "./theme";

export function Screen({ children, style, ...props }: ViewProps) {
  return (
    <SafeAreaView {...props} style={[styles.safe, style]}>
      <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ safe: { backgroundColor: defaultTheme.background, flex: 1 }, content: { gap: 16, padding: 16 } });
