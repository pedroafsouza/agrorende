import type { AppErrorCode } from "@agrorende/contracts/errors";

import { uploadDiagnostics } from "./diagnostics";
import { refreshCounters } from "./deviceStatus";
import { evictOutOfScope } from "./evict";
import { resetInFlightOutbox } from "./outbox";
import { pullChanges, type PullOutcome } from "./pull";
import { pushPendingMutations, type PushOutcome } from "./push";
import type { SyncRuntime } from "./runtime";
import type { SyncSnapshot } from "./store";
import { TransportError } from "./transport";

export type SyncReason = "start" | "foreground" | "connectivity" | "interval" | "mutation" | "poke" | "pullToRefresh" | "manual" | "background";

export interface SyncHooks {
  /** Media queue drain (§7.7); resolves when the current pass ends. */
  readonly media?: () => Promise<void>;
  /** Location buffer REST fallback flush (§7.8). */
  readonly location?: () => Promise<void>;
  /** Proactive access-token refresh before credentialed calls. */
  readonly refreshAuth?: () => Promise<boolean>;
}

export interface SyncCycleResult {
  readonly reason: SyncReason;
  readonly ok: boolean;
  readonly push?: PushOutcome;
  readonly pull?: PullOutcome;
  readonly errorCode?: AppErrorCode;
  readonly offline?: boolean;
}

export type SyncEngine = {
  /** Debounced (1 s) request for a sync cycle. */
  readonly kick: (reason?: SyncReason) => void;
  /** Runs one full cycle now (or joins the running one). */
  readonly syncNow: (reason?: SyncReason) => Promise<SyncCycleResult>;
  readonly push: () => Promise<PushOutcome | undefined>;
  readonly pull: () => Promise<PullOutcome | undefined>;
  readonly status: () => SyncSnapshot;
  /** Resets IN_FLIGHT rows (app start) and refreshes counters. */
  readonly start: () => Promise<void>;
  readonly dispose: () => void;
};

export const KICK_DEBOUNCE_MS = 1_000;
const RESTRICTED_AFTER_TIMEOUTS = 2;

export function createSyncEngine(runtime: SyncRuntime, hooks: SyncHooks = {}): SyncEngine {
  let running: Promise<SyncCycleResult> | undefined;
  let rerun: SyncReason | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let consecutiveTimeouts = 0;
  let disposed = false;
  const store = runtime.store;

  async function probe(): Promise<AppErrorCode | "OFFLINE" | undefined> {
    store.setState({ phase: "probing" });
    try {
      await runtime.api.health();
      consecutiveTimeouts = 0;
      store.setState({ network: "online" });
      return undefined;
    } catch (error) {
      if (error instanceof TransportError && error.code === "CAPTIVE_PORTAL") {
        store.setState({ network: "captivePortal" });
        return "CAPTIVE_PORTAL";
      }
      if (error instanceof TransportError && error.kind === "timeout") {
        consecutiveTimeouts += 1;
        if (consecutiveTimeouts >= RESTRICTED_AFTER_TIMEOUTS) {
          store.setState({ network: "restricted" });
          return "NETWORK_RESTRICTED";
        }
      }
      store.setState({ network: "offline" });
      return "OFFLINE";
    }
  }

  async function runCycle(reason: SyncReason): Promise<SyncCycleResult> {
    try {
      const probeError = await probe();
      if (probeError !== undefined) {
        await resetInFlightOutbox(runtime.db);
        return { reason, ok: false, ...(probeError === "OFFLINE" ? { offline: true } : { errorCode: probeError }) };
      }
      if (hooks.refreshAuth !== undefined && !(await hooks.refreshAuth())) {
        store.setState({ unauthorized: true });
        return { reason, ok: false, errorCode: "UNAUTHENTICATED" };
      }
      store.setState({ phase: "pushing" });
      const push = await pushPendingMutations(runtime);
      if (push.status === "unauthorized") {
        store.setState({ unauthorized: true });
        return { reason, ok: false, push, errorCode: "UNAUTHENTICATED" };
      }
      if (push.status === "network") {
        store.setState({ network: "offline" });
        return { reason, ok: false, push, offline: true };
      }
      store.setState({ unauthorized: false });
      if (push.status === "done") await uploadDiagnostics(runtime);
      let pull: PullOutcome | undefined;
      try {
        pull = await pullChanges(runtime);
      } catch (error) {
        await resetInFlightOutbox(runtime.db);
        if (error instanceof TransportError && error.kind !== "http") {
          store.setState({ network: "offline" });
          return { reason, ok: false, push, offline: true };
        }
        store.setState({ lastError: "PULL_FAILED" });
        return { reason, ok: false, push, errorCode: "PULL_FAILED" };
      }
      store.setState({ phase: "media" });
      if (hooks.media !== undefined) await hooks.media();
      if (hooks.location !== undefined) await hooks.location();
      await evictOutOfScope(runtime.db, { userId: runtime.userId, nowMs: runtime.clock.now() });
      store.setState({ lastError: push.status === "retry" ? "PUSH_PARTIAL_RETRY" : undefined });
      return { reason, ok: true, push, pull };
    } finally {
      await refreshCounters(runtime);
      store.setState({ phase: "idle" });
    }
  }

  function syncNow(reason: SyncReason = "manual"): Promise<SyncCycleResult> {
    if (running !== undefined) {
      rerun = reason;
      return running;
    }
    const current = runCycle(reason).finally(() => {
      running = undefined;
      const again = rerun;
      rerun = undefined;
      if (again !== undefined && !disposed) void syncNow(again);
    });
    running = current;
    return current;
  }

  return {
    kick(reason = "mutation") {
      if (disposed) return;
      if (debounce !== undefined) clearTimeout(debounce);
      void refreshCounters(runtime);
      debounce = setTimeout(() => {
        debounce = undefined;
        void syncNow(reason);
      }, KICK_DEBOUNCE_MS);
    },
    syncNow,
    async push() {
      return (await syncNow("manual")).push;
    },
    async pull() {
      return (await syncNow("manual")).pull;
    },
    status: () => store.getState(),
    async start() {
      await resetInFlightOutbox(runtime.db);
      await refreshCounters(runtime);
    },
    dispose() {
      disposed = true;
      if (debounce !== undefined) clearTimeout(debounce);
    },
  };
}
