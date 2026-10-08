import { message } from "../../i18n/messages";

/** "agora", "há 5 min", "há 3 h", "há 2 dias" — plain, relative, offline-safe. */
export function formatRelative(iso: string, nowMs: number): string {
  const diff = Math.max(0, nowMs - Date.parse(iso));
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return message("sync.time.now");
  if (minutes < 60) return message("sync.time.minutes", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return message("sync.time.hours", { count: hours });
  return message("sync.time.days", { count: Math.floor(hours / 24) });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return message("sync.size.kb", { value: Math.max(1, Math.round(bytes / 1024)) });
  return message("sync.size.mb", { value: Math.round((bytes / (1024 * 1024)) * 10) / 10 });
}
