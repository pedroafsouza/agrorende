import { useRouter } from "expo-router";
import { CalendarClock, FilePen, FilePlus2 } from "lucide-react-native";

import { listDrafts } from "../../lib/drafts";
import { useServices } from "../../lib/services";
import { useLocalQuery } from "../../lib/useLocalQuery";
import { Card, ListItem } from "../../ui";
import "./i18n";
import { listMyReports } from "./logic";

const OPEN_STATUSES = new Set(["SUBMITTED", "IN_REVIEW", "MONITORING"]);

/** Home: start a report in one tap, or continue the newest unsent draft (EC-FR-12). */
export function QuickReportCard() {
  const router = useRouter();
  const drafts = useLocalQuery(async (db) => listDrafts(db, "FIELD_REPORT"), []);
  const latest = drafts.status === "ready" ? drafts.data[0] : undefined;
  return (
    <Card testID="home-quick-report">
      <ListItem testID="home-quick-report-new" titleKey="reports.widget.quickReport" subtitleKey="reports.widget.quickReportBody" icon={FilePlus2} onPress={() => router.push("/reports/new")} />
      {latest === undefined ? null : (
        <ListItem testID="home-quick-report-resume" titleKey="reports.widget.resumeDraft" icon={FilePen} onPress={() => router.push(`/reports/new?draftId=${latest.id}`)} />
      )}
    </Card>
  );
}

/** Home: count of the user's open reports with a link to My reports. */
export function MyReportsCard() {
  const router = useRouter();
  const { userId } = useServices();
  const reports = useLocalQuery(async (db) => (userId === undefined ? [] : listMyReports(db, userId)), [userId]);
  const open = reports.status === "ready" ? reports.data.filter((r) => OPEN_STATUSES.has(r.status)).length : undefined;
  return (
    <Card testID="home-my-reports">
      <ListItem
        titleKey="reports.widget.myReports"
        {...(open === undefined ? { subtitleKey: "reports.widget.myReportsEmpty" } : { subtitleKey: "reports.widget.myReportsOpen", subtitleValues: { count: open } })}
        icon={CalendarClock}
        onPress={() => router.push("/reports")}
      />
    </Card>
  );
}
