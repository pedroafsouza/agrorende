import type { SyncStore } from "../sync/store";
import { syncStore } from "../sync/store";
import { Banner } from "./Banner";
import { useSyncSnapshot } from "./SyncBadge";

export type OfflineBannerProps = { readonly store?: SyncStore; readonly onOpenSyncCenter?: () => void };

/** Shown while offline / captive portal / restricted data; work continues locally (OFF-01). */
export function OfflineBanner({ store = syncStore, onOpenSyncCenter }: OfflineBannerProps) {
  const snapshot = useSyncSnapshot(store);
  const action = onOpenSyncCenter === undefined ? undefined : { labelKey: "sync.center.open", onPress: onOpenSyncCenter };
  if (snapshot.network === "offline") {
    return <Banner testID="offline-banner" tone="offline" titleKey="sync.offline.title" bodyKey="sync.offline.body" bodyValues={{ count: snapshot.pendingMutations + snapshot.pendingUploads }} action={action} />;
  }
  if (snapshot.network === "captivePortal") return <Banner testID="offline-banner" tone="warning" titleKey="errors.CAPTIVE_PORTAL.title" bodyKey="errors.CAPTIVE_PORTAL.body" action={action} />;
  if (snapshot.network === "restricted") return <Banner testID="offline-banner" tone="warning" titleKey="errors.NETWORK_RESTRICTED.title" bodyKey="errors.NETWORK_RESTRICTED.body" action={action} />;
  return null;
}
