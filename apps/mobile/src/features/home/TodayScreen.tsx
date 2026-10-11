import { useRouter } from "expo-router";
import { useSyncExternalStore } from "react";

import { authStore } from "../../auth/session";
import { useServices } from "../../lib/services";
import { useLocalQuery } from "../../lib/useLocalQuery";
import { pendingItemCount } from "../settings/logic";
import { HOME_ATTENTION_CODES, SyncAttentionBanners } from "../sync/SyncAttention";
import { OrgStatusBanner } from "../tenancy";
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
  const pending = useLocalQuery(pendingItemCount);
  const pendingCount = pending.status === "ready" ? pending.data : 0;

  return (
    <Screen
      testID="today"
      refreshing={false}
      onRefresh={() => void services.syncNow?.()}
      ribbon={<EnvironmentRibbon />}
      banner={
        <>
          <OfflineBanner onOpenSyncCenter={() => router.push("/sync-center")} />
          {auth.org === undefined ? null : <OrgStatusBanner status={auth.org.status} />}
        </>
      }
    >
      {auth.needsReauth ? (
        <Banner
          testID="home-reauth"
          tone="warning"
          titleKey="errors.TOKEN_EXPIRED.title"
          bodyKey={pendingCount > 0 ? "ui.home.reauthPending" : "errors.TOKEN_EXPIRED.body"}
          bodyValues={{ count: pendingCount }}
          action={{ labelKey: "ui.home.signInAgain", onPress: () => router.push("/login") }}
        />
      ) : null}
      <SyncAttentionBanners only={HOME_ATTENTION_CODES} />
      {auth.user === undefined ? null : <Text i18nKey="ui.home.greeting" values={{ name: auth.user.name.split(" ")[0] ?? auth.user.name }} variant="title" />}
      {!snapshot.firstSyncDone ? <Banner tone="info" titleKey="ui.home.firstSyncTitle" bodyKey="ui.home.firstSyncBody" /> : null}
      {widgets.map((id) => {
        const Widget = WIDGETS[id];
        return <Widget key={id} />;
      })}
    </Screen>
  );
}
