import { useRouter } from "expo-router";
import { Plus, RefreshCw } from "lucide-react-native";
import { useSyncExternalStore } from "react";
import { StyleSheet, View } from "react-native";

import { authStore } from "../../auth/session";
import { useServices } from "../../lib/services";
import { useLocalQuery } from "../../lib/useLocalQuery";
import { Button, EmptyState, ErrorState, OfflineBanner, Screen, Skeleton, Text } from "../../ui";
import "./i18n";
import { isOfficeRole, listOpenRentals, loadOrgRentalSettings, sectionRentals, type RentalSummary } from "./logic";
import { RentalRow, type RentalRowKind } from "./RentalRow";

/** Rentals tab (§13.1, every role): today's hand-overs and returns, overdue and active, offline from the mirror. */
export function RentalsScreen() {
  const router = useRouter();
  const services = useServices();
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getState);
  const office = isOfficeRole(auth.user?.role);
  const query = useLocalQuery(async (db) => ({ rentals: await listOpenRentals(db), settings: await loadOrgRentalSettings(db) }), []);
  const emptyAction = office
    ? { labelKey: "rentals.list.new", icon: Plus, onPress: () => router.push("/rentals/new") }
    : { labelKey: "ui.empty.refresh", icon: RefreshCw, onPress: () => void Promise.resolve(services.syncNow?.()).catch(() => undefined).finally(query.reload) };
  const footer = office ? <Button testID="rentals-new" icon={Plus} labelKey="rentals.list.new" onPress={() => router.push("/rentals/new")} /> : undefined;

  if (query.status === "loading") return <Screen testID="rentals-loading"><Skeleton lines={6} /></Screen>;
  if (query.status === "error") return <Screen testID="rentals-error"><ErrorState onRetry={query.reload} /></Screen>;
  const { rentals, settings } = query.data;
  if (rentals.length === 0) {
    return (
      <Screen testID="rentals-empty" banner={<OfflineBanner />}>
        <EmptyState animation="rental-handover" titleKey="rentals.list.emptyTitle" bodyKey="rentals.list.emptyBody" action={emptyAction} />
      </Screen>
    );
  }
  const now = services.now?.() ?? Date.now();
  const sections = sectionRentals(rentals, now, settings.timeZone, settings.graceHours);
  const groups: readonly { readonly kind: RentalRowKind; readonly titleKey: string; readonly rows: readonly RentalSummary[] }[] = [
    { kind: "overdue", titleKey: "rentals.section.overdue", rows: sections.overdue },
    { kind: "handOver", titleKey: "rentals.section.handOvers", rows: sections.handOvers },
    { kind: "return", titleKey: "rentals.section.returns", rows: sections.returns },
    { kind: "active", titleKey: "rentals.section.active", rows: sections.active },
    { kind: "upcoming", titleKey: "rentals.section.upcoming", rows: sections.upcoming },
  ];
  return (
    <Screen testID="rentals-list" banner={<OfflineBanner />} footer={footer} onRefresh={query.reload} refreshing={false}>
      {groups.filter((group) => group.kind !== "upcoming" || group.rows.length > 0).map((group) => (
        <View key={group.kind} testID={`rentals-section-${group.kind}`} style={styles.section}>
          <Text i18nKey={group.titleKey} values={{ count: group.rows.length }} variant="heading" accessibilityRole="header" />
          {group.rows.length === 0 ? (
            <Text i18nKey="rentals.section.none" tone="secondary" />
          ) : (
            group.rows.map((rental) => <RentalRow key={rental.id} rental={rental} kind={group.kind} timeZone={settings.timeZone} />)
          )}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8, marginBottom: 16 },
});
