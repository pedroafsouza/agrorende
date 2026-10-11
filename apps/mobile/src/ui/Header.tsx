import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import type { MessageKey, MessageValues } from "../i18n/messages";
import { Text } from "./Text";
import { space } from "./theme";

export type HeaderProps = { readonly titleKey: MessageKey; readonly titleValues?: MessageValues; readonly subtitleKey?: MessageKey; readonly subtitle?: string; readonly right?: ReactNode };

export function Header({ titleKey, titleValues, subtitleKey, subtitle, right }: HeaderProps) {
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text i18nKey={titleKey} values={titleValues} variant="title" accessibilityRole="header" />
        {subtitleKey !== undefined ? <Text i18nKey={subtitleKey} tone="secondary" /> : subtitle !== undefined ? <Text tone="secondary">{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({ row: { alignItems: "center", flexDirection: "row", gap: space[3] }, text: { flex: 1, gap: space[1] } });
