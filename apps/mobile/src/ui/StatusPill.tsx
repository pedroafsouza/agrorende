import { StyleSheet, View } from "react-native";

import type { MessageKey } from "../i18n/messages";
import { Icon } from "./Icon";
import { Text } from "./Text";
import { space, statusTone, useTheme, type StatusTone } from "./theme";

export type StatusPillProps = { readonly labelKey: MessageKey; readonly tone: StatusTone; readonly testID?: string };

/** Status = colour + icon + word (§3.7). */
export function StatusPill({ labelKey, tone, testID }: StatusPillProps) {
  const theme = useTheme();
  const style = statusTone(tone, theme);
  return (
    <View testID={testID} style={[styles.base, { backgroundColor: style.backgroundColor, borderColor: style.color }]}>
      <Icon icon={style.icon} size={18} color={style.onFill} />
      <Text i18nKey={labelKey} variant="caption" color={style.onFill} style={styles.text} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", alignSelf: "flex-start", borderRadius: 999, borderWidth: 2, flexDirection: "row", gap: space[1], minHeight: space[8], paddingHorizontal: space[3] },
  text: { fontWeight: "600" },
});
