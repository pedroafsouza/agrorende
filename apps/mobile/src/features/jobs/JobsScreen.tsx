import { CalendarCheck, CalendarClock, CircleCheck } from "lucide-react-native";
import { useState } from "react";

import { useServices } from "../../lib/services";
import { useLocalQuery } from "../../lib/useLocalQuery";
import { EmptyState, ErrorState, Screen, Segmented, Skeleton } from "../../ui";
import "./i18n";
import { JobRow } from "./JobRow";
import { bucketJobs, listMyJobs, type JobBucket } from "./logic";

const TABS = [
  { value: "today", labelKey: "jobs.list.today", icon: CalendarCheck },
  { value: "upcoming", labelKey: "jobs.list.upcoming", icon: CalendarClock },
  { value: "done", labelKey: "jobs.list.done", icon: CircleCheck },
] as const;

/** Jobs tab (WO-03): Today · Upcoming · Done, read from the local mirror so it works offline. */
export function JobsScreen() {
  const { userId, now: clock } = useServices();
  const [tab, setTab] = useState<JobBucket>("today");
  const query = useLocalQuery(async (db) => (userId === undefined ? [] : listMyJobs(db, userId)), [userId]);
  const segmented = <Segmented testID="jobs-tabs" options={TABS} value={tab} onChange={setTab} />;

  if (query.status === "loading") return <Screen testID="jobs-loading"><Skeleton lines={6} /></Screen>;
  if (query.status === "error") return <Screen testID="jobs-error"><ErrorState onRetry={query.reload} /></Screen>;
  const now = clock?.() ?? Date.now();
  const jobs = bucketJobs(query.data, now)[tab];
  return (
    <Screen testID={`jobs-${tab}`} banner={segmented} onRefresh={query.reload} refreshing={false}>
      {jobs.length === 0 ? (
        <EmptyState icon={TABS.find((t) => t.value === tab)?.icon} titleKey={`jobs.list.empty.${tab}.title`} bodyKey={`jobs.list.empty.${tab}.body`} />
      ) : (
        jobs.map((job) => <JobRow key={job.id} job={job} now={now} />)
      )}
    </Screen>
  );
}
