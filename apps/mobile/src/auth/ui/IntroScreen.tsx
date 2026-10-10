import { useRouter } from "expo-router";
import { ArrowRight, Check } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { loadDevicePrefs, saveDevicePrefs, type DevicePrefs } from "../../lib/app/prefs";
import { Button, Lottie, Screen, Text, type AnimationId } from "../../ui";
import { firstRunRoute } from "./firstRun";

interface IntroCard {
  readonly key: "offline" | "flow" | "signature";
  readonly animation: AnimationId;
}

/** The three ideas a technician needs before the first job (SIMPLER-TO-SELL §5, PLT-14). */
export const INTRO_CARDS: readonly IntroCard[] = [
  { key: "offline", animation: "report-offline" },
  { key: "flow", animation: "flow-loop" },
  { key: "signature", animation: "signature" },
];

async function markIntroSeen(): Promise<DevicePrefs> {
  try {
    return await saveDevicePrefs({ introSeen: true });
  } catch (_error) {
    // A failed write must never trap the technician here; the intro may simply show again.
    return { ...(await loadDevicePrefs()), introSeen: true };
  }
}

/**
 * First-run introduction shown once after the first sign-in: one animation and one sentence per
 * card, "Próximo"/"Começar" to advance and "Pular" always visible. Reduce motion shows still frames.
 */
export function IntroScreen() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const card = INTRO_CARDS[index] ?? INTRO_CARDS[0];
  const last = index >= INTRO_CARDS.length - 1;

  async function finish(): Promise<void> {
    if (leaving) return;
    setLeaving(true);
    router.replace(firstRunRoute(await markIntroSeen()));
  }

  if (card === undefined) return null;
  return (
    <Screen
      testID="intro"
      footer={
        <>
          <Button
            testID="intro-next"
            labelKey={last ? "auth.intro.start" : "auth.intro.next"}
            icon={last ? Check : ArrowRight}
            loading={leaving}
            onPress={() => (last ? void finish() : setIndex(index + 1))}
          />
          <Button testID="intro-skip" labelKey="auth.intro.skip" variant="ghost" disabled={leaving} onPress={() => void finish()} />
        </>
      }
    >
      <Text testID="intro-progress" i18nKey="ui.wizard.progress" values={{ current: index + 1, total: INTRO_CARDS.length }} tone="secondary" />
      <View testID={`intro-card-${card.key}`} style={styles.card}>
        <Lottie key={card.animation} id={card.animation} size={280} />
        <Text i18nKey={`auth.intro.${card.key}.title`} variant="title" accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.center} />
        <Text i18nKey={`auth.intro.${card.key}.body`} style={styles.center} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: "center", gap: 16, paddingVertical: 8 },
  center: { textAlign: "center" },
});
