import { Smartphone, UserRound } from "lucide-react-native";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Badge, Card, Icon, ListItem, Text } from "../../ui";
import { listDeviceUsers, type DeviceUser, type DeviceUserSources } from "../deviceUsers";

export interface DeviceUsersCardProps {
  readonly sources: DeviceUserSources;
}

/**
 * "On this phone" (PLT-12): everyone who has data on this shared phone and how much of their work
 * is still waiting to send. Each person's work stays in their own database and only sends after
 * they sign in again. Renders nothing when nobody has used the phone yet or the list cannot be read.
 */
export function DeviceUsersCard({ sources }: DeviceUsersCardProps) {
  const [users, setUsers] = useState<readonly DeviceUser[]>([]);

  useEffect(() => {
    let cancelled = false;
    listDeviceUsers(sources).then(
      (list) => {
        if (!cancelled) setUsers(list);
      },
      () => {
        if (!cancelled) setUsers([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [sources]);

  if (users.length === 0) return null;
  return (
    <Card>
      <View style={styles.header}>
        <Icon icon={Smartphone} />
        <Text i18nKey="auth.deviceUsers.title" variant="heading" />
      </View>
      <Text i18nKey="auth.deviceUsers.body" tone="secondary" />
      {users.map((user) => (
        <ListItem
          key={user.userId}
          testID={`device-user-${user.userId}`}
          icon={UserRound}
          title={user.name}
          right={
            user.pending === null ? (
              <Badge labelKey="auth.deviceUsers.unknown" tone="neutral" />
            ) : user.pending > 0 ? (
              <Badge labelKey="auth.deviceUsers.pending" values={{ count: user.pending }} tone="warning" />
            ) : (
              <Badge labelKey="auth.deviceUsers.upToDate" tone="success" />
            )
          }
        />
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({ header: { flexDirection: "row", alignItems: "center", gap: 8 } });
