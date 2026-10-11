import { OctagonAlert, RotateCw } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import type { MessageKey } from "../i18n/messages";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Text } from "./Text";
import { space, useTheme } from "./theme";

export type ErrorStateProps = { readonly titleKey?: MessageKey; readonly bodyKey?: MessageKey; readonly onRetry?: () => void };

export function ErrorState({ titleKey = "ui.error.title", bodyKey = "ui.error.body", onRetry }: ErrorStateProps) {
  const theme = useTheme();
  return (
    <View testID="error-state" accessibilityRole="alert" style={styles.wrap}>
      <Icon icon={OctagonAlert} size={40} color={theme.danger} />
      <Text i18nKey={titleKey} variant="heading" style={styles.center} />
      <Text i18nKey={bodyKey} tone="secondary" style={styles.center} />
      {onRetry === undefined ? null : <Button labelKey="ui.action.retry" icon={RotateCw} onPress={onRetry} />}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { alignItems: "center", gap: space[3], paddingHorizontal: space[4], paddingVertical: space[8] }, center: { textAlign: "center" } });
