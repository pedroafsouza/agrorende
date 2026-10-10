import { readWebJson, writeWebJson } from "./webStorage";
import type { DevicePrefs } from "./prefs";

export type { DevicePrefs };

/** Web variant of `prefs.ts` (development web preview only): preferences live in localStorage. */
export async function loadDevicePrefs(): Promise<DevicePrefs> {
  return readWebJson<DevicePrefs>("prefs") ?? {};
}

export async function saveDevicePrefs(patch: DevicePrefs): Promise<DevicePrefs> {
  const next = { ...(await loadDevicePrefs()), ...patch };
  writeWebJson("prefs", next);
  return next;
}
