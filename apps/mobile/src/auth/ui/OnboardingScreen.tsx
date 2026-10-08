import { useRouter } from "expo-router";
import { Bell, Camera, CloudOff, MapPin, type LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { saveDevicePrefs } from "../../lib/app/prefs";
import { Button, Card, Icon, Screen, Text, useTheme } from "../../ui";
import { space } from "../../ui/theme";

interface Slide {
  readonly key: string;
  readonly icon: LucideIcon;
}

export const ONBOARDING_SLIDES: readonly Slide[] = [
  { key: "offline", icon: CloudOff },
  { key: "camera", icon: Camera },
  { key: "location", icon: MapPin },
  { key: "notifications", icon: Bell },
];

/**
 * First-run slides that explain why each permission matters. Permissions are asked later, in
 * context (camera when capturing, location when going on duty) per the §13.6 permission matrix.
 */
export function OnboardingScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [index, setIndex] = useState(0);
  const slide = ONBOARDING_SLIDES[index] ?? ONBOARDING_SLIDES[0];
  const last = index >= ONBOARDING_SLIDES.length - 1;

  async function finish(): Promise<void> {
    await saveDevicePrefs({ onboarded: true });
    router.replace("/today");
  }

  if (slide === undefined) return null;
  return (
    <Screen
      testID="onboarding"
      footer={
        <>
          <Button testID="onboarding-next" labelKey={last ? "auth.onboarding.start" : "ui.action.next"} onPress={() => (last ? void finish() : setIndex(index + 1))} />
          {last ? null : <Button testID="onboarding-skip" labelKey="auth.onboarding.skip" variant="ghost" onPress={() => void finish()} />}
        </>
      }
    >
      <Text i18nKey="ui.wizard.progress" values={{ current: index + 1, total: ONBOARDING_SLIDES.length }} tone="secondary" />
      <Card>
        <View style={styles.icon}>
          <Icon icon={slide.icon} size={56} color={theme.primary} />
        </View>
        <Text i18nKey={`auth.onboarding.${slide.key}.title`} variant="title" />
        <Text i18nKey={`auth.onboarding.${slide.key}.body`} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  icon: { alignItems: "center", paddingVertical: space[4] },
});
