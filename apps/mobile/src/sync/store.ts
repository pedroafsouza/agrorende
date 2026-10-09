import { createStore } from "zustand/vanilla";

import type { AppErrorCode } from "@agrorende/contracts/errors";

export type SyncPhaseState = "idle" | "probing" | "pushing" | "pulling" | "media" | "resetting";
export type NetworkState = "online" | "offline" | "captivePortal" | "restricted" | "unknown";

export interface SyncSnapshot {
  readonly phase: SyncPhaseState;
  readonly network: NetworkState;
  readonly pendingMutations: number;
  readonly rejectedMutations: number;
  readonly pendingUploads: number;
  readonly failedUploads: number;
  readonly pendingBytes: number;
  readonly oldestPendingAt: string | undefined;
  readonly lastSyncAt: string | undefined;
  readonly lastError: AppErrorCode | undefined;
  readonly serverOffsetMs: number;
  readonly clockSkewed: boolean;
  readonly slowLink: boolean;
  readonly firstSyncDone: boolean;
  readonly unauthorized: boolean;
  readonly scopeEpoch: number;
  /** Fixes dropped by the last location-buffer maintenance run (EC-SYN-28). */
  readonly locationTrimmed: number;
}

export const initialSyncSnapshot: SyncSnapshot = {
  phase: "idle",
  network: "unknown",
  pendingMutations: 0,
  rejectedMutations: 0,
  pendingUploads: 0,
  failedUploads: 0,
  pendingBytes: 0,
  oldestPendingAt: undefined,
  lastSyncAt: undefined,
  lastError: undefined,
  serverOffsetMs: 0,
  clockSkewed: false,
  slowLink: false,
  firstSyncDone: false,
  unauthorized: false,
  scopeEpoch: 0,
  locationTrimmed: 0,
};

export type SyncStore = ReturnType<typeof createSyncStore>;

/** Observable sync state shared by Home, Sync Center and `SyncBadge`. */
export function createSyncStore(initial: Partial<SyncSnapshot> = {}) {
  return createStore<SyncSnapshot>()(() => ({ ...initialSyncSnapshot, ...initial }));
}

/** App-wide store; tests create their own with `createSyncStore`. */
export const syncStore = createSyncStore();

export type SyncBadgeState = "synced" | "pending" | "sending" | "failed" | "offline";

/** Collapses the snapshot into the single state `SyncBadge` shows. */
export function badgeStateOf(snapshot: SyncSnapshot): SyncBadgeState {
  if (snapshot.rejectedMutations > 0 || snapshot.failedUploads > 0) return "failed";
  if (snapshot.network === "offline" || snapshot.network === "captivePortal" || snapshot.network === "restricted") {
    return snapshot.pendingMutations + snapshot.pendingUploads > 0 ? "pending" : "offline";
  }
  if (snapshot.phase !== "idle") return "sending";
  if (snapshot.pendingMutations + snapshot.pendingUploads > 0) return "pending";
  return "synced";
}
