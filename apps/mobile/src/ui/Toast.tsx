import { useEffect, useSyncExternalStore } from "react";
import { StyleSheet, View } from "react-native";
import { createStore } from "zustand/vanilla";

import type { MessageKey, MessageValues } from "../i18n/messages";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Text } from "./Text";
import { radius, statusTone, useTheme, type StatusTone } from "./theme";

export interface ToastInput {
  readonly messageKey: MessageKey;
  readonly values?: MessageValues;
  readonly tone?: StatusTone;
  readonly action?: { readonly labelKey: MessageKey; readonly onPress: () => void };
  readonly durationMs?: number;
}

interface ToastEntry extends ToastInput {
  readonly id: number;
}

export const toastStore = createStore<{ current: ToastEntry | undefined }>()(() => ({ current: undefined }));
let nextId = 1;

export function showToast(input: ToastInput): number {
  const id = nextId++;
  toastStore.setState({ current: { ...input, id } });
  return id;
}

export function hideToast(id?: number): void {
  const current = toastStore.getState().current;
  if (current !== undefined && (id === undefined || current.id === id)) toastStore.setState({ current: undefined });
}

/** Mounted once at the root; shows one toast at a time above the tab bar. */
export function ToastHost() {
  const theme = useTheme();
  const toast = useSyncExternalStore(toastStore.subscribe, () => toastStore.getState().current);
  useEffect(() => {
    if (toast === undefined) return undefined;
    const timer = setTimeout(() => hideToast(toast.id), toast.durationMs ?? (toast.action === undefined ? 4000 : 8000));
    return () => clearTimeout(timer);
  }, [toast]);
  if (toast === undefined) return null;
  const style = statusTone(toast.tone ?? "neutral", theme);
  return (
    <View pointerEvents="box-none" style={styles.host}>
      <View testID="toast" accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.toast, { backgroundColor: theme.surfaceRaised, borderColor: style.color }]}>
        <Icon icon={style.icon} color={style.color} />
        <Text i18nKey={toast.messageKey} values={toast.values} style={styles.text} />
        {toast.action === undefined ? null : (
          <Button
            compact
            variant="ghost"
            labelKey={toast.action.labelKey}
            onPress={() => {
              toast.action?.onPress();
              hideToast(toast.id);
            }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { bottom: 96, left: 16, position: "absolute", right: 16 },
  toast: { alignItems: "center", borderRadius: radius.cards, borderWidth: 2, elevation: 8, flexDirection: "row", gap: 10, padding: 12, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8 },
  text: { flex: 1 },
});
