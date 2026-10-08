import { View, StyleSheet } from "react-native";

import type { MessageKey } from "../i18n/messages";
import { Text } from "./Text";
import { minTouchTarget, statusTone } from "./theme";

type StatusPillProps = { readonly labelKey: MessageKey; readonly tone: "success" | "warning" | "danger" | "info" | "neutral" };

export function StatusPill({ labelKey, tone }: StatusPillProps) {
  const status = statusTone(tone);
  return (
    <View style={[styles.base, { backgroundColor: status.backgroundColor, borderColor: status.color }]}>
      <Text i18nKey={labelKey} />
    </View>
  );
}

const styles = StyleSheet.create({ base: { alignItems: "center", borderRadius: 999, borderWidth: 2, minHeight: minTouchTarget, paddingHorizontal: 16 } });
