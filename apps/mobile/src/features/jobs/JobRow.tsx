import { useRouter } from "expo-router";
import { ClipboardList, PauseCircle, Wrench } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import { ListItem, StatusPill } from "../../ui";
import { formatRelative } from "../sync/format";
import "./i18n";
import { isOverdue, PRIORITY_TONE, STATUS_TONE, type JobListItem } from "./logic";

/** One job in a list: number, title, machine and place, status and priority with words and icons (§3.7). */
export function JobRow({ job, now }: { readonly job: JobListItem; readonly now: number }) {
  const router = useRouter();
  const when = job.scheduledFor ?? job.dueAt;
  const subtitle = [job.assetName, job.siteName, when === null ? null : formatRelative(when, now)].filter((part): part is string => part !== null && part.length > 0).join(" · ");
  return (
    <ListItem
      testID={`job-row-${job.id}`}
      icon={job.status === "ON_HOLD" ? PauseCircle : job.status === "IN_PROGRESS" ? Wrench : ClipboardList}
      title={job.number === null ? job.title : `${job.number} · ${job.title}`}
      subtitle={subtitle}
      right={
        <View style={styles.pills}>
          <StatusPill labelKey={`jobs.status.${job.status}`} tone={STATUS_TONE[job.status]} />
          {isOverdue(job, now) ? <StatusPill testID={`job-overdue-${job.id}`} labelKey="jobs.list.overdue" tone="danger" /> : job.priority === "CRITICAL" || job.priority === "HIGH" ? <StatusPill labelKey={`jobs.priority.${job.priority}`} tone={PRIORITY_TONE[job.priority]} /> : null}
          {job.pending ? <StatusPill labelKey="jobs.list.pending" tone="warning" /> : null}
        </View>
      }
      onPress={() => router.push(`/jobs/${job.id}`)}
    />
  );
}

const styles = StyleSheet.create({ pills: { alignItems: "flex-end", gap: 4 } });
