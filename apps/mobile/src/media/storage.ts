import type { MediaKind } from "@agrorende/contracts/enums";

export const STORAGE_LOW_BYTES = 1024 * 1024 * 1024;
export const STORAGE_CRITICAL_BYTES = 200 * 1024 * 1024;

export type StorageLevel = "ok" | "low" | "critical";

/** Storage guard of ARCHITECTURE §7.10. */
export function storageLevel(freeBytes: number): StorageLevel {
  if (freeBytes < STORAGE_CRITICAL_BYTES) return "critical";
  if (freeBytes < STORAGE_LOW_BYTES) return "low";
  return "ok";
}

/** Under 1 GB video capture is blocked (photos still allowed); under 200 MB every capture is blocked. */
export function canCapture(kind: MediaKind, freeBytes: number): boolean {
  const level = storageLevel(freeBytes);
  if (level === "critical") return false;
  if (level === "low") return kind !== "VIDEO";
  return true;
}
