import { Redirect, Stack, useRouter } from "expo-router";
import { useSyncExternalStore } from "react";

import { authStore } from "../../src/auth/session";
import { routeKeys, useT } from "../../src/i18n";
import { SyncBadge, useTheme } from "../../src/ui";

/** Auth guard plus the global sync indicator in every header (UX-08). */
export default function AppLayout() {
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getState);
  const router = useRouter();
  const theme = useTheme();
  const t = useT();
  if (auth.status === "signedOut") return <Redirect href="/login" />;
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: theme.text,
        headerStyle: { backgroundColor: theme.background },
        contentStyle: { backgroundColor: theme.background },
        headerRight: () => <SyncBadge onPress={() => router.push("/sync-center")} />,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="assets/index" options={{ title: t(routeKeys.assetsIndex) }} />
      <Stack.Screen name="assets/[id]" options={{ title: t(routeKeys.assetDetail) }} />
      <Stack.Screen name="scan" options={{ title: t(routeKeys.scan), presentation: "fullScreenModal" }} />
      <Stack.Screen name="sync-center" options={{ title: t(routeKeys.syncCenter) }} />
      <Stack.Screen name="settings" options={{ title: t(routeKeys.settings) }} />
    </Stack>
  );
}

export const titleKey = routeKeys.appShell;
