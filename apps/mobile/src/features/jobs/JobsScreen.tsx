import { CalendarCheck, CalendarClock, CircleCheck, List, Map as MapIcon, RefreshCw } from "lucide-react-native";
import { lazy, Suspense, useState } from "react";

import { useServices } from "../../lib/services";
import { useLocalQuery } from "../../lib/useLocalQuery";
import { EmptyState, ErrorState, Screen, Segmented, Skeleton } from "../../ui";
import "./i18n";
import { JobRow } from "./JobRow";
import { loadJobsMap } from "./loadJobsMap";
import { bucketJobs, listMyJobs, type JobBucket } from "./logic";

const TABS = [
  { value: "today", labelKey: "jobs.list.today", icon: CalendarCheck },
  { value: "upcoming", labelKey: "jobs.list.upcoming", icon: CalendarClock },
  { value: "done", labelKey: "jobs.list.done", icon: CircleCheck },
] as const;

const VIEWS = [
  { value: "list", labelKey: "jobs.map.toggleList", icon: List },
  { value: "map", labelKey: "jobs.map.toggleMap", icon: MapIcon },
] as const;

// The native map loads only when the worker switches to it.
const JobsMap = lazy(() => loadJobsMap().then((m) => ({ default: m.JobsMap })));

/** Jobs tab (WO-03): Today · Upcoming · Done, read from the local mirror so it works offline. */
export function JobsScreen() {
  const { userId, now: clock, syncNow } = useServices();
  const [tab, setTab] = useState<JobBucket>("today");
  const [view, setView] = useState<"list" | "map">("list");
  const query = useLocalQuery(async (db) => (userId === undefined ? [] : listMyJobs(db, userId)), [userId]);
  const segmented = (
    <>
      <Segmented testID="jobs-tabs" options={TABS} value={tab} onChange={setTab} />
      <Segmented testID="jobs-view" options={VIEWS} value={view} onChange={setView} />
    </>
  );

  if (query.status === "loading") return <Screen testID="jobs-loading"><Skeleton lines={6} /></Screen>;
  if (query.status === "error") return <Screen testID="jobs-error"><ErrorState onRetry={query.reload} /></Screen>;
  const now = clock?.() ?? Date.now();
  const jobs = bucketJobs(query.data, now)[tab];
  return (
    <Screen testID={`jobs-${tab}`} banner={segmented} onRefresh={query.reload} refreshing={false}>
      {view === "map" ? (
        <Suspense fallback={<Skeleton lines={6} />}>
          <JobsMap jobs={jobs} />
        </Suspense>
      ) : jobs.length === 0 ? (
        <EmptyState
          animation="first-work-order"
          titleKey={`jobs.list.empty.${tab}.title`}
          bodyKey={`jobs.list.empty.${tab}.body`}
          action={{ labelKey: "ui.empty.refresh", icon: RefreshCw, onPress: () => void Promise.resolve(syncNow?.()).catch(() => undefined).finally(query.reload) }}
        />
      ) : (
        jobs.map((job) => <JobRow key={job.id} job={job} now={now} />)
      )}
    </Screen>
  );
}

