import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

import type { SqlDb } from "../db/sql";
import { recordFix } from "./buffer";

export const LOCATION_TASK = "agrorende-location";

export type LocationPermission = "granted" | "foregroundOnly" | "denied";

let bufferDb: SqlDb | undefined;
let foregroundSub: Location.LocationSubscription | undefined;
let currentWorkOrderId: string | undefined;

/** The signed-in session hands its DB over so the background task can buffer fixes. */
export function setLocationBufferDb(db: SqlDb | undefined): void {
  bufferDb = db;
}

function toFix(location: Location.LocationObject) {
  return {
    recordedAt: new Date(location.timestamp).toISOString(),
    lat: location.coords.latitude,
    lng: location.coords.longitude,
    ...(location.coords.accuracy === null ? {} : { accuracyM: location.coords.accuracy }),
    ...(location.coords.speed === null || location.coords.speed < 0 ? {} : { speedMps: location.coords.speed }),
    ...(location.coords.heading === null || location.coords.heading < 0 ? {} : { heading: location.coords.heading }),
    ...(currentWorkOrderId === undefined ? {} : { workOrderId: currentWorkOrderId }),
  };
}

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error !== null || bufferDb === undefined) return;
  for (const location of data.locations) await recordFix(bufferDb, toFix(location));
});

export async function requestLocationPermission(): Promise<LocationPermission> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== Location.PermissionStatus.GRANTED) return "denied";
  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.status === Location.PermissionStatus.GRANTED ? "granted" : "foregroundOnly";
}

/**
 * Starts tracking while ON_DUTY (§7.8): foreground watch plus the background task with
 * a foreground service on Android. `enRoute` switches to high accuracy.
 */
export async function startTracking(db: SqlDb, options: { readonly enRoute?: boolean; readonly workOrderId?: string; readonly notificationTitle: string; readonly notificationBody: string }): Promise<LocationPermission> {
  bufferDb = db;
  currentWorkOrderId = options.workOrderId;
  const permission = await requestLocationPermission();
  if (permission === "denied") return permission;
  const accuracy = options.enRoute === true ? Location.Accuracy.High : Location.Accuracy.Balanced;
  foregroundSub?.remove();
  foregroundSub = await Location.watchPositionAsync({ accuracy, timeInterval: 15_000, distanceInterval: 25 }, (location) => {
    void recordFix(db, toFix(location));
  });
  if (permission === "granted") {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy,
      timeInterval: 15_000,
      distanceInterval: 25,
      pausesUpdatesAutomatically: true,
      activityType: Location.ActivityType.OtherNavigation,
      showsBackgroundLocationIndicator: true,
      foregroundService: { notificationTitle: options.notificationTitle, notificationBody: options.notificationBody },
    });
  }
  return permission;
}

/** Stops every location source (OFF_DUTY or sign-out). */
export async function stopTracking(): Promise<void> {
  foregroundSub?.remove();
  foregroundSub = undefined;
  currentWorkOrderId = undefined;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  } catch (_error) {
    // The task was never registered on this install.
  }
}
