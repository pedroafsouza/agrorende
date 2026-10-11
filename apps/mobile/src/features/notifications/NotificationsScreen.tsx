import { useRouter } from "expo-router";
import { Bell, BellDot, CheckCheck } from "lucide-react-native";
import { useState } from "react";

import { errorCodeOf } from "../../lib/errors";
import { useServices } from "../../lib/services";
import { bumpLocalData, useLocalQuery } from "../../lib/useLocalQuery";
import { markNotificationsRead } from "../../sync/mutators/notifications";
import { Button, EmptyState, ErrorState, ListItem, Screen, Skeleton, StatusPill, Text } from "../../ui";
import { InlineError } from "../../ui/recovery/InlineError";
import { formatRelative } from "../sync/format";
import { listLocalNotifications, routeForNotification, type LocalNotification } from "./logic";

/** Mobile notification centre (PLT-08): the user's notifications from the local mirror, newest first. */
export function NotificationsScreen() {
  const router = useRouter();
  const { userId } = useServices();
  const [saveError, setSaveError] = useState<string | undefined>();
  const query = useLocalQuery(async (db) => (userId === undefined ? [] : listLocalNotifications(db, userId)), [userId]);

  const markRead = async (ids: readonly string[]) => {
    if (ids.length === 0) return;
    setSaveError(undefined);
    try {
      await markNotificationsRead({ ids: [...ids] });
      bumpLocalData();
    } catch (error) {
      setSaveError(errorCodeOf(error));
    }
  };

  const open = async (item: LocalNotification) => {
    if (!item.read) await markRead([item.id]);
    const route = routeForNotification(item.entityType, item.entityId);
    if (route !== undefined) router.push(route);
  };

  if (query.status === "loading") return <Screen testID="notifications-loading"><Skeleton lines={6} /></Screen>;
  if (query.status === "error") return <Screen testID="notifications-error"><ErrorState titleKey="common.notificationCentre.loadError" onRetry={query.reload} /></Screen>;
  if (query.data.length === 0) {
    return (
      <Screen testID="notifications-empty">
        <EmptyState icon={Bell} titleKey="common.notificationCentre.empty.title" bodyKey="common.notificationCentre.empty.body" />
      </Screen>
    );
  }
  const unread = query.data.filter((item) => !item.read).map((item) => item.id);
  const now = Date.now();
  const footer =
    unread.length > 0 ? <Button testID="notifications-mark-all" variant="secondary" icon={CheckCheck} labelKey="common.notificationCentre.markAllRead" onPress={() => void markRead(unread)} /> : undefined;
  return (
    <Screen testID="notifications-list" footer={footer} onRefresh={query.reload} refreshing={false}>
      <Text testID="notifications-unread" i18nKey="common.notificationCentre.unread" values={{ count: unread.length }} tone="secondary" />
      {saveError === undefined ? null : <InlineError code={saveError} />}
      {query.data.map((item) => (
        <ListItem
          key={item.id}
          testID={`notification-${item.id}`}
          icon={item.read ? Bell : BellDot}
          title={item.title}
          subtitle={[item.body, formatRelative(item.createdAt, now)].filter((part) => part.length > 0).join(" · ")}
          badges={item.read ? undefined : <StatusPill labelKey="common.notificationCentre.unreadLabel" tone="info" />}
          onPress={() => void open(item)}
        />
      ))}
    </Screen>
  );
}
