import { useRouter } from "expo-router";
import { useSyncExternalStore } from "react";

import { authStore } from "../../auth/session";
import { useServices } from "../../lib/services";
import { Banner, EnvironmentRibbon, OfflineBanner, Screen, Text, useSyncSnapshot } from "../../ui";
import { DutyCard, MyReportsCard, NextJobCard, QuickReportCard, RentalsTodayCard, SyncCard } from "./widgets";
import { homeWidgetsFor, type HomeWidgetId } from "./registry";

const WIDGETS: Readonly<Record<HomeWidgetId, () => React.JSX.Element>> = {
  duty: DutyCard,
  quickReport: QuickReportCard,
  nextJob: NextJobCard,
  rentalsToday: RentalsTodayCard,
  myReports: MyReportsCard,
  sync: SyncCard,
};

/** "Hoje": the role widget list (§13.2). Works offline from the local mirror. */
export function TodayScreen() {
  const router = useRouter();
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getState);
  const snapshot = useSyncSnapshot();
  const services = useServices();
  const hasPendingOrFailed = snapshot.pendingMutations + snapshot.pendingUploads + snapshot.rejectedMutations + snapshot.failedUploads > 0;
  const widgets = homeWidgetsFor(auth.user?.role, { hasPendingOrFailed });

  return (
    <Screen
      testID="today"
      refreshing={false}
      onRefresh={() => void services.syncNow?.()}
      banner={
        <>
          <EnvironmentRibbon />
          <OfflineBanner onOpenSyncCenter={() => router.push("/sync-center")} />
        </>
      }
    >
      {auth.needsReauth ? (
        <Banner tone="warning" titleKey="errors.TOKEN_EXPIRED.title" bodyKey="errors.TOKEN_EXPIRED.body" action={{ labelKey: "ui.home.signInAgain", onPress: () => router.push("/login") }} />
      ) : null}
      {auth.user === undefined ? null : <Text i18nKey="ui.home.greeting" values={{ name: auth.user.name.split(" ")[0] ?? auth.user.name }} variant="title" />}
      {!snapshot.firstSyncDone ? <Banner tone="info" titleKey="ui.home.firstSyncTitle" bodyKey="ui.home.firstSyncBody" /> : null}
      {widgets.map((id) => {
        const Widget = WIDGETS[id];
        return <Widget key={id} />;
      })}
    </Screen>
  );
}
