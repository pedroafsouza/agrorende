import { Tabs } from "expo-router";

import { routeKeys } from "../../../src/i18n";

export default function TabsLayout() {
  return <Tabs screenOptions={{ headerShown: true }} />;
}

export const titleKey = routeKeys.tabsShell;
