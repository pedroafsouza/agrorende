import { Modal, StyleSheet, View } from "react-native";

import type { MessageKey, MessageValues } from "../i18n/messages";
import { Button } from "./Button";
import { Text } from "./Text";
import { radius, useTheme } from "./theme";

export type ConfirmDialogProps = {
  readonly visible: boolean;
  readonly titleKey: MessageKey;
  readonly bodyKey?: MessageKey;
  readonly bodyValues?: MessageValues;
  readonly confirmLabelKey?: MessageKey;
  readonly cancelLabelKey?: MessageKey;
  readonly destructive?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
};

export function ConfirmDialog({ visible, titleKey, bodyKey, bodyValues, confirmLabelKey = "ui.action.confirm", cancelLabelKey = "ui.action.cancel", destructive = false, onConfirm, onCancel }: ConfirmDialogProps) {
  const theme = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.scrim}>
        <View testID="confirm-dialog" accessibilityViewIsModal style={[styles.box, { backgroundColor: theme.surfaceRaised, borderColor: theme.border }]}>
          <Text i18nKey={titleKey} variant="heading" accessibilityRole="header" />
          {bodyKey === undefined ? null : <Text i18nKey={bodyKey} values={bodyValues} tone="secondary" />}
          <Button labelKey={confirmLabelKey} variant={destructive ? "danger" : "primary"} haptic onPress={onConfirm} />
          <Button labelKey={cancelLabelKey} variant="secondary" onPress={onCancel} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { alignItems: "center", backgroundColor: "rgba(17,19,21,0.5)", flex: 1, justifyContent: "center", padding: 24 },
  box: { borderRadius: radius.sheets, borderWidth: 1, gap: 12, maxWidth: 480, padding: 20, width: "100%" },
});
