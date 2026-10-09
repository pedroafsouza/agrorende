"use client";

import { useEffect, useRef, useState } from "react";

import { RealtimeServerEvents } from "@agrorende/contracts/realtime";

import type { RealtimeStatusState } from "@/components/recovery/RealtimeStatus";
import { useRealtimeEvent, useRealtimeStatus } from "@/features/shell/useRealtime";

export interface OpsRealtimeHandlers {
  readonly onLocation?: (payload: unknown) => void;
  readonly onPresence?: (payload: unknown) => void;
  readonly onActivity?: (payload: unknown) => void;
  readonly onEntityChanged?: (payload: unknown) => void;
  /** Called after a reconnect so the page refetches what it missed. */
  readonly onReconnect?: () => void;
}

export interface OpsRealtime {
  readonly state: RealtimeStatusState;
  /** When the last live message (or connection) was seen; shown in the EC-OPS-17 banner. */
  readonly lastUpdateAt: Date | null;
  /** True after a connection was lost; the page shows the paused banner until it reconnects. */
  readonly paused: boolean;
}

/**
 * Live feed of the Ops Center on the tab's single admin socket (T09-002): it subscribes through
 * `useRealtimeEvent` and derives the paused banner from `useRealtimeStatus`, so it never opens a
 * socket of its own. Office sockets join `opsRoom(orgId)` server side.
 */
export function useOpsRealtime(handlers: OpsRealtimeHandlers): OpsRealtime {
  const { state } = useRealtimeStatus();
  const [lastUpdateAt, setLastUpdateAt] = useState<Date | null>(null);
  const [paused, setPaused] = useState(false);
  const ref = useRef(handlers);
  const everConnected = useRef(false);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    if (state === "connected") {
      setPaused(false);
      setLastUpdateAt(new Date());
      if (everConnected.current) ref.current.onReconnect?.();
      everConnected.current = true;
    } else if (state === "offline" || everConnected.current) {
      setPaused(true);
    }
  }, [state]);

  const seen = () => setLastUpdateAt(new Date());
  useRealtimeEvent(RealtimeServerEvents.operatorLocation, (payload) => {
    seen();
    ref.current.onLocation?.(payload);
  });
  useRealtimeEvent(RealtimeServerEvents.operatorPresence, (payload) => {
    seen();
    ref.current.onPresence?.(payload);
  });
  useRealtimeEvent(RealtimeServerEvents.activityNew, (payload) => {
    seen();
    ref.current.onActivity?.(payload);
  });
  useRealtimeEvent(RealtimeServerEvents.entityChanged, (payload) => {
    seen();
    ref.current.onEntityChanged?.(payload);
  });

  return { state, lastUpdateAt, paused };
}
