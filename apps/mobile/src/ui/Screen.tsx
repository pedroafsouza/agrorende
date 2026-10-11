import { useState, type ReactNode } from "react";
import { RefreshControl, ScrollView, StyleSheet, View, type ViewProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { space, useTheme } from "./theme";

export type ScreenProps = ViewProps & {
  readonly scroll?: boolean;
  /** Fixed bottom area for the one primary action. */
  readonly footer?: ReactNode;
  /** Full-bleed strip above everything else (the environment ribbon). */
  readonly ribbon?: ReactNode;
  /** Fixed notices and controls above the scroll area, inset like the content. */
  readonly banner?: ReactNode;
  readonly refreshing?: boolean;
  readonly onRefresh?: () => void;
};

export function Screen({ children, style, scroll = true, footer, ribbon, banner, refreshing, onRefresh, ...props }: ScreenProps) {
  const theme = useTheme();
  // A banner slot whose children all render null must not leave an empty gap above the content.
  const [bannerVisible, setBannerVisible] = useState(false);
  return (
    <SafeAreaView edges={["bottom", "left", "right"]} {...props} style={[styles.safe, { backgroundColor: theme.background }, style]}>
      {ribbon}
      {banner === undefined || banner === null ? null : (
        <View style={[styles.banner, bannerVisible && styles.bannerVisible]}>
          <View style={styles.bannerStack} onLayout={(event) => setBannerVisible(event.nativeEvent.layout.height > 0)}>
            {banner}
          </View>
        </View>
      )}
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
  banner: { paddingHorizontal: space[4] },
  bannerVisible: { paddingTop: space[4] },
  bannerStack: { gap: space[2] },
  content: { gap: space[4], padding: space[4] },
  fill: { flex: 1 },
  footer: { borderTopWidth: 1, gap: space[2], padding: space[4] },
});
