import { useRouter } from "expo-router";
import { RefreshCw } from "lucide-react-native";

import { useServices } from "../../lib/services";
import { Button, Card, SyncBadge, Text, useSyncSnapshot } from "../../ui";
import { formatRelative } from "../sync/format";

/** Today's sync summary: state, pending work and a way into Sync Center (OFF-05). */
export function SyncCard() {
  const snapshot = useSyncSnapshot();
  const services = useServices();
  const router = useRouter();
  const pending = snapshot.pendingMutations + snapshot.pendingUploads;
  return (
    <Card testID="sync-card" onPress={() => router.push("/sync-center")}>
      <SyncBadge onPress={() => router.push("/sync-center")} />
      {snapshot.lastSyncAt === undefined ? (
        <Text i18nKey="sync.lastSync.never" tone="secondary" />
      ) : (
        <Text i18nKey="sync.lastSync.at" values={{ when: formatRelative(snapshot.lastSyncAt, Date.now()) }} tone="secondary" />
      )}
      {pending > 0 ? <Text i18nKey="sync.pending.summary" values={{ count: pending }} /> : null}
      <Button testID="sync-card-now" labelKey="sync.action.syncNow" variant="secondary" compact icon={RefreshCw} disabled={services.syncNow === undefined} onPress={() => void services.syncNow?.()} />
    </Card>
  );
}
