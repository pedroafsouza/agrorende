export interface ForegroundFix {
  readonly lat: number;
  readonly lng: number;
  readonly accuracyM: number | null;
}

/**
 * Foreground position updates for on-screen helpers (the arrival prompt). Never asks for
 * permission: without an existing grant it resolves to a no-op stop function. expo-location loads
 * lazily so screens that only might watch do not pull the native module in eagerly.
 */
export async function watchForegroundFix(onFix: (fix: ForegroundFix) => void): Promise<() => void> {
  const Location = await import("expo-location");
  const permission = await Location.getForegroundPermissionsAsync();
  if (permission.status !== "granted") return () => undefined;
  const subscription = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 25, timeInterval: 15_000 }, (position) =>
    onFix({ lat: position.coords.latitude, lng: position.coords.longitude, accuracyM: position.coords.accuracy }),
  );
  return () => subscription.remove();
}
