import { useRouter } from "expo-router";
import { CircleAlert, FilePlus2, FileText } from "lucide-react-native";
import { View } from "react-native";

import { useServices } from "../../lib/services";
import { useLocalQuery } from "../../lib/useLocalQuery";
import { Button, EmptyState, ErrorState, ListItem, Screen, Skeleton, StatusPill } from "../../ui";
import { formatRelative } from "../sync/format";
import "./i18n";
import { listMyReports, STATUS_TONE } from "./logic";

/** My reports tab (FR-08): the user's reports with status, newest first, offline from the mirror. */
export function MyReportsScreen() {
  const router = useRouter();
  const { userId } = useServices();
  const query = useLocalQuery(async (db) => (userId === undefined ? [] : listMyReports(db, userId)), [userId]);
  const footer = <Button testID="reports-new" icon={FilePlus2} labelKey="reports.list.new" onPress={() => router.push("/reports/new")} />;

  if (query.status === "loading") return <Screen testID="reports-loading"><Skeleton lines={6} /></Screen>;
  if (query.status === "error") return <Screen testID="reports-error"><ErrorState onRetry={query.reload} /></Screen>;
  if (query.data.length === 0) {
    return (
      <Screen testID="reports-empty">
        <EmptyState animation="report-offline" titleKey="reports.list.emptyTitle" bodyKey="reports.list.emptyBody" action={{ labelKey: "reports.list.new", icon: FilePlus2, onPress: () => router.push("/reports/new") }} />
      </Screen>
    );
  }
  const now = Date.now();
  return (
    <Screen testID="reports-list" footer={footer} onRefresh={query.reload} refreshing={false}>
      {query.data.map((report) => (
        <ListItem
          key={report.id}
          testID={`report-row-${report.id}`}
          icon={report.machineOperable ? FileText : CircleAlert}
          title={report.number === null ? report.title : `${report.number} · ${report.title}`}
          subtitle={[report.assetName, formatRelative(report.createdAt, now)].filter((part) => part !== null && part.length > 0).join(" · ")}
          right={
            <View style={{ alignItems: "flex-end", gap: 4 }}>
              <StatusPill labelKey={`reports.status.${report.status}`} tone={STATUS_TONE[report.status] ?? "neutral"} />
              {report.pending ? <StatusPill labelKey="reports.list.pending" tone="warning" /> : null}
            </View>
          }
          onPress={() => router.push(`/reports/${report.id}`)}
        />
      ))}
    </Screen>
  );
}
