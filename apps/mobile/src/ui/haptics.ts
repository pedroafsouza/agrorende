import * as Haptics from "expo-haptics";

/** Haptics on submit, status changes and signatures (UX-10). Failures are silent. */
export function hapticSuccess(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}

export function hapticWarning(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
}

export function hapticTap(): void {
  Haptics.selectionAsync().catch(() => undefined);
}
