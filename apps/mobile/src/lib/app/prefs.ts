import { File, Paths } from "expo-file-system";

import type { AppLocale } from "../../i18n/runtime";
import type { ThemePreference } from "../../ui/theme";

/** Device-level preferences that apply before sign-in (language and theme). */
export interface DevicePrefs {
  readonly locale?: AppLocale;
  readonly theme?: ThemePreference;
  readonly onboarded?: boolean;
}

function prefsFile(): File {
  return new File(Paths.document, "prefs.json");
}

export async function loadDevicePrefs(): Promise<DevicePrefs> {
  try {
    const file = prefsFile();
    if (!file.exists) return {};
    return JSON.parse(await file.text()) as DevicePrefs;
  } catch (_error) {
    return {};
  }
}

export async function saveDevicePrefs(patch: DevicePrefs): Promise<DevicePrefs> {
  const next = { ...(await loadDevicePrefs()), ...patch };
  await prefsFile().write(JSON.stringify(next));
  return next;
}
