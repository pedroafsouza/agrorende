import type { LucideIcon } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import type { MessageKey } from "../i18n/messages";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Lottie, type AnimationId } from "./Lottie";
import { Text } from "./Text";
import { space, useTheme } from "./theme";

export type EmptyStateProps = {
  /** Static icon for "not found" and blocked states. Without it, the empty state shows an animation. */
  readonly icon?: LucideIcon;
  /** Animation for list empty states (SIMPLER-TO-SELL §2.1). Defaults to `empty` when no icon is given. */
  readonly animation?: AnimationId;
  readonly titleKey?: MessageKey;
  readonly bodyKey?: MessageKey;
  readonly action?: { readonly labelKey: MessageKey; readonly onPress: () => void; readonly icon?: LucideIcon };
};

export function EmptyState({ icon, animation, titleKey = "ui.empty.title", bodyKey = "ui.empty.body", action }: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View testID="empty-state" style={styles.wrap}>
      {animation !== undefined || icon === undefined ? <Lottie id={animation ?? "empty"} size={160} testID="empty-state-animation" /> : <Icon icon={icon} size={40} color={theme.textSecondary} />}
      <Text i18nKey={titleKey} variant="heading" style={styles.center} />
      <Text i18nKey={bodyKey} tone="secondary" style={styles.center} />
      {action === undefined ? null : <Button testID="empty-state-action" labelKey={action.labelKey} icon={action.icon} onPress={action.onPress} />}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { alignItems: "center", gap: space[3], paddingHorizontal: space[4], paddingVertical: space[8] }, center: { textAlign: "center" } });
