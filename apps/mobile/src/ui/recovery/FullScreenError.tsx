import type { AppErrorCode } from "@agrorende/contracts/errors";
import { OctagonAlert, Send } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import { Button } from "../Button";
import { Icon } from "../Icon";
import { Screen } from "../Screen";
import { Text } from "../Text";
import { space, useTheme } from "../theme";
import { AskOfficeButton } from "./AskOfficeButton";
import { useRecovery, type RecoveryHandlers } from "./useRecovery";

export type FullScreenErrorProps = { readonly code: AppErrorCode; readonly handlers?: RecoveryHandlers };

/** Last-resort surface: never a dead end — always an action, Ask office or diagnostics. */
export function FullScreenError({ code, handlers }: FullScreenErrorProps) {
  const theme = useTheme();
  const recovery = useRecovery(code, handlers);
  const diag = recovery.actions.find((a) => a.pattern === "DIAG");
  return (
    <Screen>
      <View testID={`full-screen-error-${code}`} style={styles.wrap}>
        <Icon icon={OctagonAlert} size={56} color={theme.danger} />
        <Text i18nKey={recovery.titleKey} variant="title" style={styles.center} accessibilityRole="header" />
        <Text i18nKey={recovery.bodyKey} tone="secondary" style={styles.center} />
      </View>
      {recovery.actions
        .filter((a) => a.pattern !== "DIAG")
        .map((action, index) => (
          <Button key={action.pattern} variant={index === 0 ? "primary" : "secondary"} labelKey={action.labelKey} onPress={action.run} />
        ))}
      {recovery.canAskOffice || recovery.actions.length === 0 ? <AskOfficeButton code={code} /> : null}
      {diag === undefined ? null : <Button variant="ghost" icon={Send} labelKey="ui.recovery.diag" onPress={diag.run} />}
    </Screen>
  );
}

const styles = StyleSheet.create({ wrap: { alignItems: "center", gap: space[3], paddingVertical: space[8] }, center: { textAlign: "center" } });
