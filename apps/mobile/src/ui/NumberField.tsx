import { Minus, Plus } from "lucide-react-native";
import { useEffect, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { formatNumber, parseLocaleNumber } from "@agrorende/i18n";

import type { MessageKey } from "../i18n/messages";
import { useLocale, useT } from "../i18n/useT";
import { Button } from "./Button";
import { Text } from "./Text";
import { radius, space, useTheme } from "./theme";

export type NumberFieldProps = {
  readonly labelKey: MessageKey;
  readonly value: number | undefined;
  readonly onChange: (value: number | undefined) => void;
  readonly step?: number;
  readonly min?: number;
  readonly max?: number;
  readonly unitKey?: MessageKey;
  readonly errorKey?: MessageKey;
  readonly testID?: string;
};

/** Locale-aware number input with big steppers for gloved hands. */
export function NumberField({ labelKey, value, onChange, step = 1, min, max, unitKey, errorKey, testID }: NumberFieldProps) {
  const theme = useTheme();
  const t = useT();
  const locale = useLocale();
  const [text, setText] = useState(value === undefined ? "" : formatNumber(value, locale));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setText(value === undefined ? "" : formatNumber(value, locale));
  }, [value, locale]);

  const clamp = (n: number) => Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, n));
  const bump = (delta: number) => onChange(clamp((value ?? min ?? 0) + delta));

  return (
    <View style={styles.wrap}>
      <Text i18nKey={labelKey} variant="label" />
      <View style={styles.row}>
        <TextInput
          testID={testID}
          accessibilityLabel={t(labelKey)}
          keyboardType="decimal-pad"
          value={text}
          onChangeText={(next) => {
            setText(next);
            if (next.trim() === "") {
              setInvalid(false);
              onChange(undefined);
              return;
            }
            try {
              const parsed = parseLocaleNumber(next, locale);
              setInvalid(false);
              onChange(clamp(parsed));
            } catch (_error) {
              setInvalid(true);
            }
          }}
          style={[styles.input, { color: theme.text, borderColor: invalid || errorKey !== undefined ? theme.danger : theme.border, backgroundColor: theme.surfaceRaised }]}
        />
        {unitKey === undefined ? null : <Text i18nKey={unitKey} tone="secondary" />}
      </View>
      <View style={styles.row}>
        <Button compact variant="secondary" style={styles.stepper} icon={Minus} labelKey="ui.number.decrease" onPress={() => bump(-step)} />
        <Button compact variant="secondary" style={styles.stepper} icon={Plus} labelKey="ui.number.increase" onPress={() => bump(step)} />
      </View>
      {invalid ? <Text i18nKey="errors.INVALID_LOCALE_NUMBER.title" tone="danger" variant="caption" /> : errorKey === undefined ? null : <Text i18nKey={errorKey} tone="danger" variant="caption" />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[2] },
  row: { alignItems: "center", flexDirection: "row", gap: space[2] },
  stepper: { flex: 1 },
  input: { borderRadius: radius.controls, borderWidth: 2, flex: 1, fontSize: 22, fontVariant: ["tabular-nums"], minHeight: 56, paddingHorizontal: space[3], textAlign: "center" },
});
