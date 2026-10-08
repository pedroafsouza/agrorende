import { Redirect } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { routeKeys } from "../../src/i18n";
import { appConfig } from "../../src/lib/app/config";
import {
  Badge,
  Banner,
  Button,
  Card,
  Chip,
  EmptyState,
  ListItem,
  Screen,
  Segmented,
  Skeleton,
  StatusPill,
  SyncBadge,
  Text,
  TextField,
  appThemes,
  setThemePreference,
  showToast,
  space,
  useTheme,
  useThemePreference,
  type ThemePreference,
} from "../../src/ui";

const THEME_OPTIONS: readonly { value: ThemePreference; labelKey: "settings.theme.system" | "settings.theme.light" | "settings.theme.dark" | "settings.theme.outdoor" }[] = [
  { value: "system", labelKey: "settings.theme.system" },
  { value: "light", labelKey: "settings.theme.light" },
  { value: "dark", labelKey: "settings.theme.dark" },
  { value: "outdoor", labelKey: "settings.theme.outdoor" },
];

/** Dev-only catalogue of tokens, themes and the UI kit (§3.7). Hidden in production builds. */
export default function StyleGuide() {
  const theme = useTheme();
  const preference = useThemePreference();
  const [chip, setChip] = useState(false);
  if (appConfig.appEnv === "production") return <Redirect href="/" />;
  return (
    <Screen testID="style-guide">
      <Text variant="display">Campo claro</Text>
      <Segmented options={THEME_OPTIONS} value={preference} onChange={setThemePreference} testID="style-guide-theme" />
      <Card>
        <Text variant="heading">Palette · {theme.name}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
          {Object.entries(appThemes[theme.name]).filter(([, value]) => typeof value === "string" && value.startsWith("#")).map(([name, value]) => (
            <View key={name} style={{ width: 96, gap: space[1] }}>
              <View style={{ height: 48, borderRadius: 8, backgroundColor: String(value), borderWidth: 1, borderColor: theme.border }} />
              <Text variant="caption">{name}</Text>
            </View>
          ))}
        </View>
      </Card>
      <Card>
        <Text variant="heading">Type</Text>
        <Text variant="display">Display 32</Text>
        <Text variant="heading">Heading</Text>
        <Text variant="title">Title</Text>
        <Text>Body 17 — legible em pleno sol.</Text>
        <Text variant="label">Label</Text>
        <Text variant="caption">Caption</Text>
      </Card>
      <Card>
        <Text variant="heading">Buttons</Text>
        <Button labelKey="ui.action.save" onPress={() => showToast({ messageKey: "ui.toast.saved", tone: "success" })} />
        <Button labelKey="ui.action.cancel" variant="secondary" />
        <Button labelKey="ui.action.delete" variant="danger" />
        <Button labelKey="ui.action.retry" variant="ghost" />
        <Button labelKey="ui.action.save" loading />
      </Card>
      <Card>
        <Text variant="heading">Status</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
          <StatusPill labelKey="ui.status.synced" tone="success" />
          <StatusPill labelKey="ui.status.pending" tone="warning" />
          <StatusPill labelKey="ui.status.failed" tone="danger" />
          <Badge labelKey="sync.pending.summary" values={{ count: 3 }} tone="info" />
          <SyncBadge state="pending" count={3} />
          <SyncBadge state="offline" />
          <Chip labelKey="ui.action.select" selected={chip} onPress={() => setChip(!chip)} />
        </View>
      </Card>
      <Banner tone="warning" titleKey="errors.CLOCK_SKEW.title" bodyKey="errors.CLOCK_SKEW.body" />
      <Banner tone="error" titleKey="errors.INTERNAL.title" action={{ labelKey: "ui.action.retry", onPress: () => undefined }} />
      <TextField labelKey="auth.login.email" hintKey="auth.login.emailHint" />
      <ListItem titleKey="ui.more.settings" subtitleKey="ui.more.settingsBody" onPress={() => undefined} />
      <EmptyState titleKey="ui.empty.title" bodyKey="ui.empty.body" />
      <Skeleton lines={3} />
    </Screen>
  );
}

export const titleKey = routeKeys.styleGuide;
