import { Stack } from "expo-router";

import { routeKeys } from "../src/i18n";

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: true }} />;
}

export const titleKey = routeKeys.root;
