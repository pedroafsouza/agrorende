import { Inbox, type LucideIcon } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import type { MessageKey } from "../i18n/messages";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Text } from "./Text";
import { useTheme } from "./theme";

export type EmptyStateProps = {
  readonly icon?: LucideIcon;
  readonly titleKey?: MessageKey;
  readonly bodyKey?: MessageKey;
  readonly action?: { readonly labelKey: MessageKey; readonly onPress: () => void; readonly icon?: LucideIcon };
};

export function EmptyState({ icon = Inbox, titleKey = "ui.empty.title", bodyKey = "ui.empty.body", action }: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View testID="empty-state" style={styles.wrap}>
      <Icon icon={icon} size={40} color={theme.textSecondary} />
      <Text i18nKey={titleKey} variant="heading" style={styles.center} />
      <Text i18nKey={bodyKey} tone="secondary" style={styles.center} />
      {action === undefined ? null : <Button labelKey={action.labelKey} icon={action.icon} onPress={action.onPress} />}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 32 }, center: { textAlign: "center" } });
