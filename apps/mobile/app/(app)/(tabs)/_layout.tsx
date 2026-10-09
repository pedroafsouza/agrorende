import { Tabs, useRouter } from "expo-router";
import { ClipboardList, FileText, Home, Menu, Truck, type LucideIcon } from "lucide-react-native";

import { useUnreadNotifications } from "../../../src/features/notifications";
import { usePushNotifications } from "../../../src/features/notifications/pushNative";
import { routeKeys, useT } from "../../../src/i18n";
import { Icon, SyncBadge, useTheme } from "../../../src/ui";
import { minTouchTarget } from "../../../src/ui/theme";

const TAB_ICONS: Readonly<Record<string, LucideIcon>> = { today: Home, reports: FileText, jobs: ClipboardList, rentals: Truck, more: Menu };

/**
 * Tabs for every role: Hoje, Relatos, Serviços, Locações, Mais (PLT-02). Icon always with label.
 * Mais carries the unread notification count and push taps open the record (PLT-08).
 */
export default function TabsLayout() {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const unread = useUnreadNotifications();
  usePushNotifications();
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: true,
        headerTintColor: theme.text,
        headerStyle: { backgroundColor: theme.background },
        headerRight: () => <SyncBadge onPress={() => router.push("/sync-center")} />,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: { backgroundColor: theme.surfaceRaised, borderTopColor: theme.border, minHeight: minTouchTarget + 16 },
        tabBarLabelStyle: { fontSize: 13, fontWeight: "600" },
        tabBarIcon: ({ color }) => {
          const glyph = TAB_ICONS[route.name];
          return glyph === undefined ? null : <Icon icon={glyph} color={String(color)} />;
        },
      })}
    >
      <Tabs.Screen name="today" options={{ title: t(routeKeys.today), tabBarButtonTestID: "tab-today" }} />
      <Tabs.Screen name="reports" options={{ title: t(routeKeys.reports), tabBarButtonTestID: "tab-reports" }} />
      <Tabs.Screen name="jobs" options={{ title: t(routeKeys.jobs), tabBarButtonTestID: "tab-jobs" }} />
      <Tabs.Screen name="rentals" options={{ title: t(routeKeys.rentals), tabBarButtonTestID: "tab-rentals" }} />
      <Tabs.Screen
        name="more"
        options={{
          title: t(routeKeys.more),
          tabBarButtonTestID: "tab-more",
          tabBarBadge: unread > 0 ? (unread > 99 ? "99+" : unread) : undefined,
          tabBarBadgeStyle: { backgroundColor: theme.danger, color: theme.onPrimary },
          tabBarAccessibilityLabel: unread > 0 ? `${t(routeKeys.more)}, ${t("common.notificationCentre.unread", { count: unread })}` : t(routeKeys.more),
        }}
      />
    </Tabs>
  );
}

export const titleKey = routeKeys.tabsShell;
