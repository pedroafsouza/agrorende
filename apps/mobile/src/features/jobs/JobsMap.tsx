import { useRouter } from "expo-router";
import { MapPinOff } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import MapView, { Marker } from "react-native-maps";

import { useT } from "../../i18n/useT";
import { EmptyState, StatusPill, Text, statusTone, useTheme } from "../../ui";
import { jobPins, pinsRegion, PRIORITY_TONE, type JobListItem } from "./logic";

/** Jobs map (P1): pins coloured by urgency; the legend repeats the urgency in words. Tap opens the job. */
export function JobsMap({ jobs }: { readonly jobs: readonly JobListItem[] }) {
  const router = useRouter();
  const theme = useTheme();
  const t = useT();
  const pins = jobPins(jobs);
  const region = pinsRegion(pins);
  if (region === undefined) return <EmptyState icon={MapPinOff} titleKey="jobs.map.noPins" />;
  return (
    <View style={styles.wrap} testID="jobs-map">
      <View style={styles.map}>
        <MapView style={StyleSheet.absoluteFill} initialRegion={region} toolbarEnabled={false}>
          {pins.map((pin) => (
            <Marker
              key={pin.id}
              testID={`jobs-pin-${pin.id}`}
              coordinate={{ latitude: pin.lat, longitude: pin.lng }}
              title={pin.title}
              description={t(`jobs.priority.${pin.priority}`)}
              accessibilityLabel={t("jobs.map.pinLabel", { title: pin.title, priority: t(`jobs.priority.${pin.priority}`) })}
              pinColor={statusTone(pin.tone, theme).color}
              onCalloutPress={() => router.push(`/jobs/${pin.id}`)}
              onPress={() => router.push(`/jobs/${pin.id}`)}
            />
          ))}
        </MapView>
      </View>
      <Text i18nKey="jobs.map.legend" variant="caption" tone="secondary" />
      <View style={styles.legend}>
        {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((priority) => (
          <StatusPill key={priority} labelKey={`jobs.priority.${priority}`} tone={PRIORITY_TONE[priority]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  map: { borderRadius: 12, height: 360, overflow: "hidden" },
  wrap: { gap: 8 },
});
