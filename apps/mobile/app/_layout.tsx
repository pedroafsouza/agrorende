import { resolveLocale } from "@agrorende/i18n";
import { getLocales } from "expo-localization";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { routeKeys, useT } from "../src/i18n";
import { loadDevicePrefs } from "../src/lib/app/prefs";
import { startApp } from "../src/lib/app/session";
import { errorCodeOf } from "../src/lib/errors";
import type { AppErrorCode } from "@agrorende/contracts/errors";
import { Screen, Skeleton, ToastHost, setThemePreference, useTheme } from "../src/ui";
import { FullScreenError, ScreenErrorBoundary } from "../src/ui/recovery";

/** Providers (§13.1): DB and migrations first, i18n, theme, session, sync engine, toasts. */
export default function RootLayout() {
  const theme = useTheme();
  const t = useT();
  const [state, setState] = useState<{ status: "starting" | "ready" } | { status: "failed"; code: AppErrorCode }>({ status: "starting" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const prefs = await loadDevicePrefs();
      if (prefs.theme !== undefined) setThemePreference(prefs.theme);
      const locale = prefs.locale ?? resolveLocale(getLocales().map((entry) => entry.languageTag));
      await startApp(locale);
      if (!cancelled) setState({ status: "ready" });
    })().catch((error: unknown) => {
      if (!cancelled) setState({ status: "failed", code: errorCodeOf(error, "LOCAL_DB_REPAIR_REQUIRED") });
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ScreenErrorBoundary screen="root" onReset={() => setAttempt((value) => value + 1)}>
          {state.status === "starting" ? (
            <Screen testID="app-starting">
              <Skeleton lines={6} />
            </Screen>
          ) : state.status === "failed" ? (
            <FullScreenError code={state.code} handlers={{ retry: () => setAttempt((value) => value + 1) }} />
          ) : (
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background }, title: t(routeKeys.root) }} />
          )}
          <ToastHost />
        </ScreenErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export const titleKey = routeKeys.root;
