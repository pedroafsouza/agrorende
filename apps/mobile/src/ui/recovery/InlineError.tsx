import { CircleAlert } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import { Icon } from "../Icon";
import { Text } from "../Text";
import { space, useTheme } from "../theme";

export type InlineErrorProps = { readonly code?: string; readonly messageKey?: string; readonly testID?: string };

/** Field-level message with an icon (colour is never the only signal). */
export function InlineError({ code, messageKey, testID = "inline-error" }: InlineErrorProps) {
  const theme = useTheme();
  const key = messageKey ?? `errors.${code ?? "INTERNAL"}.title`;
  return (
    <View testID={testID} accessibilityRole="alert" style={styles.row}>
      <Icon icon={CircleAlert} size={18} color={theme.danger} />
      <Text i18nKey={key} tone="danger" variant="caption" style={styles.text} />
    </View>
  );
}

const styles = StyleSheet.create({ row: { alignItems: "center", flexDirection: "row", gap: space[2] }, text: { flex: 1 } });
