import { useRouter, type Href } from "expo-router";
import { Bell, Fuel, QrCode, RefreshCw, Settings, Tractor, type LucideIcon } from "lucide-react-native";
import { useSyncExternalStore } from "react";

import { authStore } from "../../auth/session";
import type { MessageKey } from "../../i18n/messages";
import { Badge, Card, EnvironmentRibbon, ListItem, Screen, Text, useSyncSnapshot } from "../../ui";

interface MoreEntry {
  readonly id: string;
  readonly titleKey: MessageKey;
  readonly subtitleKey: MessageKey;
  readonly icon: LucideIcon;
  readonly href: Href;
}

export const MORE_ENTRIES: readonly MoreEntry[] = [
  { id: "assets", titleKey: "ui.more.assets", subtitleKey: "ui.more.assetsBody", icon: Tractor, href: "/assets" },
  { id: "scan", titleKey: "ui.more.scan", subtitleKey: "ui.more.scanBody", icon: QrCode, href: "/scan?purpose=find" },
  { id: "notifications", titleKey: "ui.more.notifications", subtitleKey: "ui.more.notificationsBody", icon: Bell, href: "/notifications" },
  { id: "fuel", titleKey: "ui.more.fuel", subtitleKey: "ui.more.fuelBody", icon: Fuel, href: "/fuel/new" },
  { id: "sync", titleKey: "ui.more.sync", subtitleKey: "ui.more.syncBody", icon: RefreshCw, href: "/sync-center" },
  { id: "settings", titleKey: "ui.more.settings", subtitleKey: "ui.more.settingsBody", icon: Settings, href: "/settings" },
];

/** "Mais": machines, scanner, notifications, fuel, Sync Center and Settings. */
export function MoreScreen() {
  const router = useRouter();
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getState);
  const snapshot = useSyncSnapshot();
  const pending = snapshot.pendingMutations + snapshot.pendingUploads;
  return (
    <Screen testID="more" banner={<EnvironmentRibbon />}>
      {auth.user === undefined ? null : (
        <Card>
          <Text variant="title">{auth.user.name}</Text>
          {auth.org === undefined ? null : <Text tone="secondary">{auth.org.name}</Text>}
        </Card>
      )}
      <Card>
        {MORE_ENTRIES.map((entry) => (
          <ListItem
            key={entry.id}
            testID={`more-${entry.id}`}
            icon={entry.icon}
            titleKey={entry.titleKey}
            subtitleKey={entry.subtitleKey}
            right={entry.id === "sync" && pending > 0 ? <Badge labelKey="sync.pending.summary" values={{ count: pending }} tone="warning" /> : undefined}
            onPress={() => router.push(entry.href)}
          />
        ))}
      </Card>
    </Screen>
  );
}
