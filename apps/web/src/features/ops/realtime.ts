"use client";

import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

import { RealtimeServerEvents } from "@agrorende/contracts/realtime";

import type { RealtimeStatusState } from "@/components/recovery/RealtimeStatus";
import { api } from "@/lib/api";

/** The slice of a socket.io client the Ops Center needs; tests inject a fake emitter. */
export interface OpsSocket {
  on(event: string, listener: (payload: unknown) => void): void;
  disconnect(): void;
}

export type OpsSocketFactory = () => Promise<OpsSocket>;

const REALTIME_URL = process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:4001";

/** Default factory: a dedicated socket for the Ops Center; office sockets join `opsRoom(orgId)` server side. */
export const createOpsSocket: OpsSocketFactory = async () => {
  const token = async () => (await api<{ token: string }>("/auth/socket-token", { method: "POST" })).token;
  const first = await token();
  const socket = io(REALTIME_URL, { auth: (cb) => void cb({ token: first }), transports: ["websocket"] });
  socket.on("connect_error", (error: Error) => {
    if (error.message === "UNAUTHENTICATED") {
      void token().then((next) => {
        socket.auth = { token: next };
      });
    }
  });
  return {
    on: (event, listener) => {
      socket.on(event, listener);
    },
    disconnect: () => {
      socket.disconnect();
    },
  };
};

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

export function useOpsRealtime(factory: OpsSocketFactory, handlers: OpsRealtimeHandlers): OpsRealtime {
  const [state, setState] = useState<RealtimeStatusState>("connecting");
  const [lastUpdateAt, setLastUpdateAt] = useState<Date | null>(null);
  const [paused, setPaused] = useState(false);
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    let socket: OpsSocket | null = null;
    let cancelled = false;
    let everConnected = false;
    const seen = () => setLastUpdateAt(new Date());
    void (async () => {
      try {
        const next = await factory();
        if (cancelled) {
          next.disconnect();
          return;
        }
        socket = next;
        next.on("connect", () => {
          setState("connected");
          setPaused(false);
          seen();
          if (everConnected) ref.current.onReconnect?.();
          everConnected = true;
        });
        next.on("disconnect", () => {
          setState("reconnecting");
          setPaused(true);
        });
        next.on("connect_error", () => {
          setState("reconnecting");
          if (everConnected) setPaused(true);
        });
        next.on(RealtimeServerEvents.operatorLocation, (payload) => {
          seen();
          ref.current.onLocation?.(payload);
        });
        next.on(RealtimeServerEvents.operatorPresence, (payload) => {
          seen();
          ref.current.onPresence?.(payload);
        });
        next.on(RealtimeServerEvents.activityNew, (payload) => {
          seen();
          ref.current.onActivity?.(payload);
        });
        next.on(RealtimeServerEvents.entityChanged, (payload) => {
          seen();
          ref.current.onEntityChanged?.(payload);
        });
      } catch {
        if (!cancelled) {
          setState("offline");
          setPaused(true);
        }
      }
    })();
    const online = () => setState((s) => (s === "offline" ? "reconnecting" : s));
    const offline = () => {
      setState("offline");
      setPaused(true);
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      socket?.disconnect();
    };
  }, [factory]);

  return { state, lastUpdateAt, paused };
}
