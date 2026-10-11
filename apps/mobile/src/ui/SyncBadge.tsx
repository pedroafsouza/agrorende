import { CircleCheck, CloudOff, Hourglass, RefreshCw, TriangleAlert, type LucideIcon } from "lucide-react-native";
import { useSyncExternalStore } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";

import { badgeStateOf, syncStore, type SyncBadgeState, type SyncStore } from "../sync/store";
import { Icon } from "./Icon";
import { Text } from "./Text";
import { minTouchTarget, space, statusTone, useTheme, type StatusTone } from "./theme";

const LOOK: Readonly<Record<SyncBadgeState, { readonly icon: LucideIcon; readonly tone: StatusTone; readonly key: string }>> = {
  synced: { icon: CircleCheck, tone: "success", key: "sync.badge.synced" },
  pending: { icon: Hourglass, tone: "warning", key: "sync.badge.pending" },
  sending: { icon: RefreshCw, tone: "info", key: "sync.badge.sending" },
  failed: { icon: TriangleAlert, tone: "danger", key: "sync.badge.failed" },
  offline: { icon: CloudOff, tone: "neutral", key: "sync.badge.offline" },
};

export type SyncBadgeProps = { readonly state?: SyncBadgeState; readonly store?: SyncStore; readonly onPress?: () => void; readonly count?: number };

export function useSyncSnapshot(store: SyncStore = syncStore) {
  return useSyncExternalStore(store.subscribe, store.getState);
}

/** ✓ / ⏳ / ⚠ with a word; without `state` it follows the global sync store (UX-08). */
export function SyncBadge({ state, store = syncStore, onPress, count }: SyncBadgeProps) {
  const theme = useTheme();
  const snapshot = useSyncSnapshot(store);
  const resolved = state ?? badgeStateOf(snapshot);
  const look = LOOK[resolved];
  const tone = statusTone(look.tone, theme);
  const pending = count ?? snapshot.pendingMutations + snapshot.pendingUploads;
  return (
    <Pressable
      testID={`sync-badge-${resolved}`}
      accessibilityRole={onPress === undefined ? "text" : "button"}
      disabled={onPress === undefined}
      onPress={onPress}
      style={[styles.base, { minHeight: onPress === undefined ? 32 : minTouchTarget, backgroundColor: tone.backgroundColor, borderColor: tone.color }]}
    >
      <Icon icon={look.icon} size={18} color={tone.onFill} />
      <Text i18nKey={look.key} values={{ count: pending }} variant="caption" color={tone.onFill} style={styles.text} />
    </Pressable>
  );
}

export type HeaderSyncBadgeProps = { readonly onPress: () => void; readonly nativeHeader?: boolean };

/**
 * The sync badge as a header button. The JavaScript header puts header buttons flush against the
 * screen edge, so the badge brings its own inset; native stack headers already inset it.
 */
export function HeaderSyncBadge({ onPress, nativeHeader = false }: HeaderSyncBadgeProps) {
  const inset = nativeHeader && Platform.OS !== "web" ? 0 : space[4];
  return (
    <View style={[styles.header, { paddingEnd: inset }]}>
      <SyncBadge onPress={onPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { justifyContent: "center", paddingStart: space[2] },
  base: { alignItems: "center", alignSelf: "flex-start", borderRadius: 999, borderWidth: 2, flexDirection: "row", gap: space[1], paddingHorizontal: space[3] },
  text: { fontWeight: "600" },
});
