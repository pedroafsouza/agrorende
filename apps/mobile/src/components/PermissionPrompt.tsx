import { Settings, ShieldAlert } from "lucide-react-native";
import { Linking, StyleSheet, View } from "react-native";

import { permissionGuidance, type PermissionKind, type PermissionState } from "../lib/permissions";
import { Button, Card, Icon, Text, statusTone, useTheme } from "../ui";

export type PermissionPromptProps = {
  readonly kind: PermissionKind;
  readonly state: PermissionState;
  readonly onRequest: () => void;
  /** Alternate path from the permission matrix (gallery, typed note, site picker…). */
  readonly onAlternate?: () => void;
};

/** Priming / denied / blocked / limited copy with one primary action and the ALT path (§13.6). */
export function PermissionPrompt({ kind, state, onRequest, onAlternate }: PermissionPromptProps) {
  const theme = useTheme();
  const guidance = permissionGuidance(kind, state);
  if (guidance.state === "granted") return null;
  return (
    <Card testID={`permission-${kind}-${guidance.state}`}>
      <View style={styles.row}>
        <Icon icon={ShieldAlert} size={28} color={statusTone("warning", theme).color} />
        <Text i18nKey={guidance.titleKey} variant="heading" style={styles.flex} />
      </View>
      <Text i18nKey={guidance.bodyKey} tone="secondary" />
      {guidance.action === "openSettings" ? (
        <Button
          testID={`permission-${kind}-settings`}
          icon={Settings}
          labelKey="permissions.action.openSettings"
          onPress={() => {
            Linking.openSettings().catch(() => undefined);
          }}
        />
      ) : guidance.actionKey === undefined ? null : (
        <Button testID={`permission-${kind}-ask`} labelKey={guidance.actionKey} onPress={onRequest} />
      )}
      {guidance.altKey !== undefined && onAlternate !== undefined ? <Button testID={`permission-${kind}-alt`} variant="ghost" labelKey={guidance.altKey} onPress={onAlternate} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 }, row: { alignItems: "center", flexDirection: "row", gap: 12 } });
