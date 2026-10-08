import type { SyncEngine, SyncReason } from "./engine";

export type SyncTriggerSubscription = { readonly remove: () => void };

export interface TriggerSources {
  /** AppState-like: emits "active" when the app comes to the foreground. */
  readonly onAppStateChange: (listener: (state: string) => void) => SyncTriggerSubscription;
  /** NetInfo-like: emits whether the internet is reachable. */
  readonly onConnectivityChange: (listener: (connected: boolean) => void) => SyncTriggerSubscription;
  /** Realtime `sync:poke`. */
  readonly onPoke?: (listener: () => void) => SyncTriggerSubscription;
  readonly intervalMs?: number;
  readonly setInterval?: (fn: () => void, ms: number) => unknown;
  readonly clearInterval?: (handle: unknown) => void;
}

export const SYNC_INTERVAL_MS = 60_000;

/**
 * Wires the sync triggers of §7.2: start, foreground, connectivity regained, the
 * 60 s foreground interval and `sync:poke`. Mutations kick the engine themselves.
 */
export function registerSyncTriggers(engine: Pick<SyncEngine, "kick" | "syncNow">, sources: TriggerSources): SyncTriggerSubscription {
  let foreground = true;
  let wasConnected: boolean | undefined;
  const fire = (reason: SyncReason) => void engine.syncNow(reason);
  const subs: SyncTriggerSubscription[] = [];

  subs.push(
    sources.onAppStateChange((state) => {
      const nowForeground = state === "active";
      if (nowForeground && !foreground) fire("foreground");
      foreground = nowForeground;
    }),
  );
  subs.push(
    sources.onConnectivityChange((connected) => {
      if (connected && wasConnected === false) fire("connectivity");
      wasConnected = connected;
    }),
  );
  if (sources.onPoke !== undefined) subs.push(sources.onPoke(() => engine.kick("poke")));

  const setTimer = sources.setInterval ?? ((fn: () => void, ms: number) => setInterval(fn, ms));
  const clearTimer = sources.clearInterval ?? ((handle: unknown) => clearInterval(handle as ReturnType<typeof setInterval>));
  const handle = setTimer(() => {
    if (foreground) fire("interval");
  }, sources.intervalMs ?? SYNC_INTERVAL_MS);

  fire("start");
  return {
    remove() {
      clearTimer(handle);
      for (const sub of subs) sub.remove();
    },
  };
}
