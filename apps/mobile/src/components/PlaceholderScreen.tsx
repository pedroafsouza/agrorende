import { Stack } from "expo-router";

import { routeKeys } from "../i18n";
import type { MessageKey } from "../i18n/messages";
import { message } from "../i18n/messages";
import { Button, Card, Screen, Text } from "../ui";

type PlaceholderScreenProps = { readonly titleKey: MessageKey };

export function PlaceholderScreen({ titleKey }: PlaceholderScreenProps) {
  return (
    <Screen>
      <Stack.Screen options={{ title: message(titleKey) }} />
      <Card>
        <Text i18nKey={titleKey} />
        <Text i18nKey="placeholder.body" tone="secondary" />
      </Card>
      <Button labelKey="placeholder.cta" />
    </Screen>
  );
}

export const placeholderRootTitle = routeKeys.root;
