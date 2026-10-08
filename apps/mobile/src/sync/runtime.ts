import { uuidv7 } from "uuidv7";

import type { SqlDb } from "../db/sql";
import type { SyncStore } from "./store";
import type { SyncApi } from "./transport";

export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export interface DeviceInfo {
  readonly appVersion: string;
  readonly runtimeVersion: string;
  readonly batteryLevel?: number;
  readonly freeStorageBytes?: number;
  readonly pushStatus?: "OK" | "DENIED" | "TOKEN_INVALID";
}

/** Everything the engine and the mutators need; one instance per signed-in user. */
export interface SyncRuntime {
  readonly db: SqlDb;
  readonly api: SyncApi;
  readonly deviceId: string;
  readonly userId: string;
  readonly clock: Clock;
  readonly store: SyncStore;
  readonly random: () => number;
  readonly newId: () => string;
  readonly deviceInfo: () => Promise<DeviceInfo>;
  /** Debounced "something changed" signal (mutators call it after commit). */
  readonly kick: () => void;
}

export type SyncRuntimeInput = Omit<SyncRuntime, "clock" | "random" | "newId" | "kick" | "deviceInfo"> &
  Partial<Pick<SyncRuntime, "clock" | "random" | "newId" | "kick" | "deviceInfo">>;

let current: SyncRuntime | undefined;

export function createSyncRuntime(input: SyncRuntimeInput): SyncRuntime {
  return {
    clock: systemClock,
    random: Math.random,
    newId: uuidv7,
    kick: () => undefined,
    deviceInfo: async () => ({ appVersion: "0.0.0", runtimeVersion: "0" }),
    ...input,
  };
}

export function setSyncRuntime(runtime: SyncRuntime | undefined): void {
  current = runtime;
}

export function hasSyncRuntime(): boolean {
  return current !== undefined;
}

export function getSyncRuntime(): SyncRuntime {
  if (current === undefined) throw new Error("sync runtime is not initialised (no signed-in user)");
  return current;
}

export function nowIso(runtime: Pick<SyncRuntime, "clock">): string {
  return new Date(runtime.clock.now()).toISOString();
}
