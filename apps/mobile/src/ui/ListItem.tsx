import type { LucideIcon } from "lucide-react-native";
import { ChevronRight } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import type { MessageKey, MessageValues } from "../i18n/messages";
import { Icon } from "./Icon";
import { Text } from "./Text";
import { minTouchTarget, useTheme } from "./theme";

export type ListItemProps = {
  readonly titleKey?: MessageKey;
  readonly titleValues?: MessageValues;
  readonly title?: string;
  readonly subtitleKey?: MessageKey;
  readonly subtitleValues?: MessageValues;
  readonly subtitle?: string;
  readonly icon?: LucideIcon;
  readonly right?: ReactNode;
  readonly onPress?: () => void;
  readonly testID?: string;
  readonly danger?: boolean;
};

export function ListItem({ titleKey, titleValues, title, subtitleKey, subtitleValues, subtitle, icon, right, onPress, testID, danger = false }: ListItemProps) {
  const theme = useTheme();
  const body = (
    <>
      {icon === undefined ? null : <Icon icon={icon} color={danger ? theme.danger : theme.text} />}
      <View style={styles.text}>
        {titleKey !== undefined ? <Text i18nKey={titleKey} values={titleValues} variant="label" tone={danger ? "danger" : "body"} /> : <Text variant="label">{title}</Text>}
        {subtitleKey !== undefined ? <Text i18nKey={subtitleKey} values={subtitleValues} tone="secondary" variant="caption" /> : subtitle === undefined ? null : <Text tone="secondary" variant="caption">{subtitle}</Text>}
      </View>
      {right}
      {onPress === undefined ? null : <Icon icon={ChevronRight} color={theme.textSecondary} />}
    </>
  );
  const rowStyle = [styles.row, { borderBottomColor: theme.border }];
  if (onPress === undefined) {
    return (
      <View testID={testID} style={rowStyle}>
        {body}
      </View>
    );
  }
  return (
    <Pressable testID={testID} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [rowStyle, pressed && { backgroundColor: theme.surface }]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 12, minHeight: 56, paddingVertical: 8 },
  text: { flex: 1, gap: 2, minHeight: minTouchTarget - 16, justifyContent: "center" },
});
