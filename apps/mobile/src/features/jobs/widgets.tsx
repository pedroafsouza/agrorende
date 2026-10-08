import { useRouter } from "expo-router";
import { ClipboardList } from "lucide-react-native";

import { useServices } from "../../lib/services";
import { useLocalQuery } from "../../lib/useLocalQuery";
import { Card, ListItem, Skeleton, StatusPill } from "../../ui";
import "./i18n";
import { listMyJobs, nextJob, STATUS_TONE } from "./logic";

/** Home: the technician's next job, or a calm "nothing assigned" line (A§13.2). */
export function NextJobCard() {
  const router = useRouter();
  const { userId, now: clock } = useServices();
  const query = useLocalQuery(async (db) => (userId === undefined ? [] : listMyJobs(db, userId)), [userId]);
  if (query.status === "loading") {
    return (
      <Card testID="home-next-job">
        <Skeleton lines={2} />
      </Card>
    );
  }
  if (query.status === "error") {
    return (
      <Card testID="home-next-job">
        <ListItem testID="home-next-job-error" titleKey="jobs.widget.title" subtitleKey="jobs.widget.error" icon={ClipboardList} onPress={query.reload} />
      </Card>
    );
  }
  const job = nextJob(query.data, clock?.() ?? Date.now());
  return (
    <Card testID="home-next-job">
      {job === undefined ? (
        <ListItem testID="home-next-job-empty" titleKey="jobs.widget.title" subtitleKey="jobs.widget.empty" icon={ClipboardList} onPress={() => router.push("/jobs")} />
      ) : (
        <ListItem
          testID="home-next-job-open"
          titleKey="jobs.widget.title"
          subtitle={[job.number, job.title, job.assetName].filter((part): part is string => part !== null && part.length > 0).join(" · ")}
          icon={ClipboardList}
          right={<StatusPill labelKey={`jobs.status.${job.status}`} tone={STATUS_TONE[job.status]} />}
          onPress={() => router.push(`/jobs/${job.id}`)}
        />
      )}
    </Card>
  );
}
