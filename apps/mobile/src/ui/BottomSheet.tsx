import { X } from "lucide-react-native";
import { type ReactNode, useEffect, useState } from "react";
import { AccessibilityInfo, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";

import type { MessageKey, MessageValues } from "../i18n/messages";
import { useT } from "../i18n/useT";
import { IconButton } from "./IconButton";
import { Text } from "./Text";
import { radius, useTheme } from "./theme";

/** OS "reduce motion" setting, read without Reanimated so the kit bundles with core React Native only. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReduced(value);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      active = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

export type BottomSheetProps = {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly titleKey: MessageKey;
  readonly titleValues?: MessageValues;
  readonly children: ReactNode;
  readonly testID?: string;
};

/** Modal sheet with radius 16 and one overlay shadow level; slides unless reduced motion is on. */
export function BottomSheet({ visible, onClose, titleKey, titleValues, children, testID }: BottomSheetProps) {
  const theme = useTheme();
  const t = useT();
  const reduced = useReducedMotion();
  return (
    <Modal visible={visible} transparent animationType={reduced ? "none" : "slide"} onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityRole="button" accessibilityLabel={t("ui.action.close")} style={styles.scrim} onPress={onClose} />
      <View testID={testID} style={[styles.sheet, { backgroundColor: theme.surfaceRaised, borderColor: theme.border }]}>
        <View style={styles.head}>
          <Text i18nKey={titleKey} values={titleValues} variant="heading" accessibilityRole="header" style={styles.title} />
          <IconButton icon={X} labelKey="ui.action.close" onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: "rgba(17,19,21,0.5)", flex: 1 },
  sheet: {
    borderTopLeftRadius: radius.sheets,
    borderTopRightRadius: radius.sheets,
    borderWidth: 1,
    elevation: 12,
    maxHeight: "85%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  head: { alignItems: "center", flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  title: { flex: 1 },
  body: { gap: 12, padding: 16, paddingBottom: 32 },
});
