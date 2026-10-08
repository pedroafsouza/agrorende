import { Stack } from "expo-router";

import { routeKeys, useT } from "../../src/i18n";
import { useTheme } from "../../src/ui";

export default function AuthLayout() {
  const t = useT();
  const theme = useTheme();
  return (
    <Stack screenOptions={{ headerShown: true, headerTintColor: theme.text, headerStyle: { backgroundColor: theme.background }, contentStyle: { backgroundColor: theme.background } }}>
      <Stack.Screen name="login" options={{ headerShown: false, title: t(routeKeys.login) }} />
      <Stack.Screen name="change-password" options={{ title: t(routeKeys.changePassword) }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false, title: t(routeKeys.onboarding) }} />
    </Stack>
  );
}
