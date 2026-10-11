import type { LucideIcon } from "lucide-react-native";
import { ChevronRight } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import type { MessageKey, MessageValues } from "../i18n/messages";
import { Icon } from "./Icon";
import { Text } from "./Text";
import { minTouchTarget, space, useTheme } from "./theme";

export type ListItemProps = {
  readonly titleKey?: MessageKey;
  readonly titleValues?: MessageValues;
  readonly title?: string;
  readonly subtitleKey?: MessageKey;
  readonly subtitleValues?: MessageValues;
  readonly subtitle?: string;
  readonly icon?: LucideIcon;
  /** Compact trailing content (a count, a short badge, one action). */
  readonly right?: ReactNode;
  /** Status pills; they wrap under the subtitle so they never squeeze the title. */
  readonly badges?: ReactNode;
  readonly onPress?: () => void;
  readonly testID?: string;
  readonly danger?: boolean;
  /** Bottom hairline between rows. `Card` turns it off when no row follows. */
  readonly divider?: boolean;
};

export function ListItem({ titleKey, titleValues, title, subtitleKey, subtitleValues, subtitle, icon, right, badges, onPress, testID, danger = false, divider = true }: ListItemProps) {
  const theme = useTheme();
  const body = (
    <>
      {icon === undefined ? null : <Icon icon={icon} color={danger ? theme.danger : theme.text} />}
      <View style={styles.text}>
        {titleKey !== undefined ? <Text i18nKey={titleKey} values={titleValues} variant="label" tone={danger ? "danger" : "body"} /> : <Text variant="label">{title}</Text>}
        {subtitleKey !== undefined ? <Text i18nKey={subtitleKey} values={subtitleValues} tone="secondary" variant="caption" /> : subtitle === undefined ? null : <Text tone="secondary" variant="caption">{subtitle}</Text>}
        {badges === undefined || badges === null ? null : <View style={styles.badges}>{badges}</View>}
      </View>
      {right === undefined || right === null ? null : <View style={styles.right}>{right}</View>}
      {onPress === undefined ? null : <Icon icon={ChevronRight} color={theme.textSecondary} />}
    </>
  );
  const rowStyle = [styles.row, divider ? { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth } : null];
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
  row: { alignItems: "center", flexDirection: "row", gap: space[3], minHeight: space[14], paddingVertical: space[2] },
  text: { flex: 1, flexShrink: 1, gap: 2, minHeight: minTouchTarget - space[4], justifyContent: "center" },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space[2], marginTop: space[1] },
  right: { alignItems: "flex-end", flexShrink: 0, gap: space[1], maxWidth: "50%" },
});
