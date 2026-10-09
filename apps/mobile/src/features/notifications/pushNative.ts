import * as Application from "expo-application";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";

import { getApiClient, getDeviceId, platform } from "../../lib/app/session";
import { useServices } from "../../lib/services";
import { bumpLocalData } from "../../lib/useLocalQuery";
import { handlePushTap, registerPushForActiveUser } from "./push";

function easProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
  return typeof extra?.eas?.projectId === "string" ? extra.eas.projectId : undefined;
}

/** Registers push for the active user and routes taps on pushes to the record (PLT-08, PLT-12). */
export function usePushNotifications(): void {
  const router = useRouter();
  const { db, userId } = useServices();

  useEffect(() => {
    if (userId === undefined) return;
    const deviceId = getDeviceId();
    if (deviceId.length === 0) return;
    registerPushForActiveUser({
      permissionGranted: async () => (await Notifications.getPermissionsAsync()).granted,
      pushToken: async () => {
        const projectId = easProjectId();
        if (!Device.isDevice || projectId === undefined) return undefined;
        return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      },
      register: (body) => getApiClient().registerDevice(body),
      device: {
        deviceId,
        platform,
        model: Device.modelName ?? "unknown",
        osVersion: String(Platform.Version),
        appVersion: Application.nativeApplicationVersion ?? "0.0.0",
        runtimeVersion: Application.nativeBuildVersion ?? "0",
      },
    }).catch(() => undefined);
  }, [userId]);

  useEffect(() => {
    if (db === undefined || userId === undefined) return undefined;
    const open = (response: Notifications.NotificationResponse | null) => {
      if (response === null) return;
      handlePushTap(db, userId, response.notification.request.content.data)
        .then((route) => {
          bumpLocalData();
          if (route !== undefined) router.push(route);
        })
        .catch(() => undefined);
    };
    open(Notifications.getLastNotificationResponse());
    Notifications.clearLastNotificationResponse();
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, [db, userId, router]);
}
