import { useRouter } from "expo-router";
import { MapPin, Power } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { message } from "../../i18n/messages";
import { useServices } from "../../lib/services";
import { bumpLocalData, useLocalQuery } from "../../lib/useLocalQuery";
import { hasLocationConsent, recordLocationConsent } from "../../location/consent";
import { startTracking, stopTracking } from "../../location/tracker";
import { setDuty } from "../../sync/mutators/user";
import { Banner, BottomSheet, Button, Card, Icon, Skeleton, StatusPill, Text, useTheme } from "../../ui";
import { space } from "../../ui/theme";

type DutyStatus = "ON_DUTY" | "OFF_DUTY";

/** On/off duty switch with the one-time location consent (PLT-04, §7.8). */
export function DutyCard() {
  const services = useServices();
  const theme = useTheme();
  const router = useRouter();
  const [consentOpen, setConsentOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const query = useLocalQuery(async (db) => {
    if (services.userId === undefined) return { status: "OFF_DUTY" as DutyStatus, consent: false };
    const row = await db.get<{ dutyStatus: string | null }>("SELECT dutyStatus FROM users WHERE id = ?", [services.userId]);
    return { status: (row?.dutyStatus === "ON_DUTY" ? "ON_DUTY" : "OFF_DUTY") as DutyStatus, consent: await hasLocationConsent(db) };
  }, [services.userId]);

  if (query.status !== "ready") return <Card testID="duty-card"><Skeleton lines={2} /></Card>;
  const onDuty = query.data.status === "ON_DUTY";

  async function goOnDuty(): Promise<void> {
    const db = services.db;
    if (db === undefined) return;
    setBusy(true);
    try {
      await recordLocationConsent(db, new Date().toISOString());
      await setDuty({ status: "ON_DUTY", consent: true });
      const permission = await startTracking(db, { notificationTitle: message("ui.duty.notificationTitle"), notificationBody: message("ui.duty.notificationBody") });
      setDenied(permission === "denied");
      bumpLocalData();
    } finally {
      setBusy(false);
      setConsentOpen(false);
    }
  }

  async function goOffDuty(): Promise<void> {
    setBusy(true);
    try {
      await setDuty({ status: "OFF_DUTY" });
      await stopTracking();
      setDenied(false);
      bumpLocalData();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card testID="duty-card">
      <View style={styles.row}>
        <Icon icon={Power} color={onDuty ? theme.primary : theme.textSecondary} />
        <View style={styles.flex}>
          <Text i18nKey="ui.duty.title" variant="label" />
          <Text i18nKey={onDuty ? "ui.duty.onBody" : "ui.duty.offBody"} tone="secondary" />
        </View>
        <StatusPill labelKey={onDuty ? "ui.duty.on" : "ui.duty.off"} tone={onDuty ? "success" : "neutral"} />
      </View>
      {denied ? (
        <Banner tone="warning" titleKey="errors.PERMISSION_LOCATION_LIMITED.title" bodyKey="errors.PERMISSION_LOCATION_LIMITED.body" action={{ labelKey: "permissions.action.openSettings", onPress: () => router.push("/settings") }} />
      ) : null}
      <Button
        testID="duty-toggle"
        labelKey={onDuty ? "ui.duty.goOff" : "ui.duty.goOn"}
        variant={onDuty ? "secondary" : "primary"}
        icon={MapPin}
        loading={busy}
        onPress={() => {
          if (onDuty) void goOffDuty();
          else if (query.data.consent) void goOnDuty();
          else setConsentOpen(true);
        }}
      />
      <BottomSheet visible={consentOpen} onClose={() => setConsentOpen(false)} titleKey="ui.duty.consentTitle" testID="duty-consent">
        <Text i18nKey="ui.duty.consentBody" />
        <Button testID="duty-consent-accept" labelKey="ui.duty.consentAccept" loading={busy} onPress={() => void goOnDuty()} />
        <Button labelKey="ui.action.cancel" variant="ghost" onPress={() => setConsentOpen(false)} />
      </BottomSheet>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space[3] },
  flex: { flex: 1 },
});
