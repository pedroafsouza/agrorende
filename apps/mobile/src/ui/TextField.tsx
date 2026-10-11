import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";

import type { MessageKey } from "../i18n/messages";
import { useT } from "../i18n/useT";
import { Text } from "./Text";
import { minTouchTarget, radius, space, useTheme } from "./theme";

export type TextFieldProps = Omit<TextInputProps, "placeholder"> & {
  readonly labelKey: MessageKey;
  readonly hintKey?: MessageKey;
  readonly placeholderKey?: MessageKey;
  readonly errorKey?: MessageKey;
};

export function TextField({ labelKey, hintKey, placeholderKey, errorKey, style, multiline, ...props }: TextFieldProps) {
  const theme = useTheme();
  const t = useT();
  const invalid = errorKey !== undefined;
  return (
    <View style={styles.wrap}>
      <Text i18nKey={labelKey} variant="label" />
      <TextInput
        accessibilityLabel={t(labelKey)}
        placeholder={placeholderKey === undefined ? undefined : t(placeholderKey)}
        placeholderTextColor={theme.textSecondary}
        multiline={multiline}
        maxFontSizeMultiplier={1.3}
        {...props}
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.surfaceRaised, borderColor: invalid ? theme.danger : theme.border, borderWidth: invalid ? 2 : Math.max(1, theme.borderWidth) },
          multiline === true && styles.multiline,
          style,
        ]}
      />
      {invalid ? <Text i18nKey={errorKey} tone="danger" variant="caption" accessibilityLiveRegion="polite" /> : hintKey === undefined ? null : <Text i18nKey={hintKey} tone="secondary" variant="caption" />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[2] },
  input: { borderRadius: radius.controls, fontSize: 17, minHeight: minTouchTarget + 4, paddingHorizontal: space[3], paddingVertical: space[3] },
  multiline: { minHeight: 112, textAlignVertical: "top" },
});
