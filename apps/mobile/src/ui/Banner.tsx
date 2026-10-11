import { CircleCheck, CloudOff, Info, OctagonAlert, TriangleAlert, X, type LucideIcon } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import type { MessageKey, MessageValues } from "../i18n/messages";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { IconButton } from "./IconButton";
import { Text } from "./Text";
import { radius, space, statusTone, useTheme, type StatusTone } from "./theme";

export type BannerTone = "info" | "warning" | "error" | "offline" | "success";

const TONES: Readonly<Record<BannerTone, { readonly tone: StatusTone; readonly icon: LucideIcon }>> = {
  info: { tone: "info", icon: Info },
  warning: { tone: "warning", icon: TriangleAlert },
  error: { tone: "danger", icon: OctagonAlert },
  offline: { tone: "neutral", icon: CloudOff },
  success: { tone: "success", icon: CircleCheck },
};

export type BannerAction = { readonly labelKey: MessageKey; readonly onPress: () => void };

export type BannerProps = {
  readonly tone?: BannerTone;
  readonly titleKey: MessageKey;
  readonly titleValues?: MessageValues;
  readonly bodyKey?: MessageKey;
  readonly bodyValues?: MessageValues;
  readonly action?: BannerAction;
  readonly secondaryAction?: BannerAction;
  readonly onDismiss?: () => void;
  readonly testID?: string;
};

export function Banner({ tone = "info", titleKey, titleValues, bodyKey, bodyValues, action, secondaryAction, onDismiss, testID }: BannerProps) {
  const theme = useTheme();
  const look = TONES[tone];
  const style = statusTone(look.tone, theme);
  return (
    <View testID={testID} accessibilityRole="alert" style={[styles.base, { backgroundColor: style.backgroundColor, borderColor: style.color }]}>
      <View style={styles.row}>
        <Icon icon={look.icon} color={style.onFill} />
        <View style={styles.text}>
          <Text i18nKey={titleKey} values={titleValues} variant="label" color={style.onFill} />
          {bodyKey === undefined ? null : <Text i18nKey={bodyKey} values={bodyValues} variant="caption" color={style.onFill} />}
        </View>
        {onDismiss === undefined ? null : <IconButton icon={X} labelKey="ui.action.dismiss" onPress={onDismiss} />}
      </View>
      {action === undefined && secondaryAction === undefined ? null : (
        <View style={styles.actions}>
          {action === undefined ? null : <Button compact variant="secondary" labelKey={action.labelKey} onPress={action.onPress} />}
          {secondaryAction === undefined ? null : <Button compact variant="ghost" labelKey={secondaryAction.labelKey} onPress={secondaryAction.onPress} />}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.cards, borderWidth: 2, gap: space[2], padding: space[3] },
  row: { alignItems: "flex-start", flexDirection: "row", gap: space[3] },
  text: { flex: 1, gap: 2 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
});
