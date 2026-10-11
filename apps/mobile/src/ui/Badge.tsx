import { StyleSheet, View } from "react-native";

import type { MessageKey, MessageValues } from "../i18n/messages";
import { Text } from "./Text";
import { radius, space, statusTone, useTheme, type StatusTone } from "./theme";

export type BadgeProps = { readonly labelKey: MessageKey; readonly values?: MessageValues; readonly tone?: StatusTone };

export function Badge({ labelKey, values, tone = "neutral" }: BadgeProps) {
  const theme = useTheme();
  const style = statusTone(tone, theme);
  return (
    <View style={[styles.base, { backgroundColor: style.backgroundColor, borderColor: style.color }]}>
      <Text i18nKey={labelKey} values={values} variant="caption" color={style.onFill} style={styles.text} />
    </View>
  );
}

const styles = StyleSheet.create({ base: { alignSelf: "flex-start", borderRadius: radius.controls, borderWidth: 1, paddingHorizontal: space[2], paddingVertical: 2 }, text: { fontWeight: "600" } });
