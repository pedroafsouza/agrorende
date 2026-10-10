"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { io, type Socket } from "socket.io-client";

import { RealtimeServerEvents, type EntityChangedPayload, type RealtimeServerEvent } from "@agrorende/contracts/realtime";
import type { EntityType } from "@agrorende/contracts/enums";

import { api } from "@/lib/api";
import { clientRealtimeUrl } from "@/lib/realtimeUrl";

export type RealtimeState = "connecting" | "connected" | "reconnecting" | "offline";

/** EntityType → REST collection used as the first element of React Query keys. */
export const ENTITY_QUERY_KEYS: Partial<Record<EntityType, readonly string[]>> = {
  ASSET: ["assets"],
  SITE: ["sites"],
  PLOT: ["sites", "plots"],
  SEASON: ["seasons"],
  CUSTOMER: ["customers"],
  CHECKLIST_TEMPLATE: ["checklist-templates"],
  USER: ["users"],
  DEVICE: ["devices"],
  FIELD_REPORT: ["reports"],
  WORK_ORDER: ["work-orders"],
  RENTAL: ["rentals"],
};

export interface RealtimeStatus {
  readonly state: RealtimeState;
  readonly lastMessageAt: Date | null;
  readonly reconnectCount: number;
}

type Handler = (payload: unknown) => void;

/*
 * The tab's single socket is owned by `useRealtime` (mounted once in the admin shell). Other
 * features subscribe through `useRealtimeEvent` and read `useRealtimeStatus` instead of opening
 * their own socket (T09-002).
 */
const handlers = new Map<string, Set<Handler>>();
const statusListeners = new Set<() => void>();
const INITIAL_STATUS: RealtimeStatus = { state: "connecting", lastMessageAt: null, reconnectCount: 0 };
let status: RealtimeStatus = INITIAL_STATUS;

function setStatus(next: Partial<RealtimeStatus>): void {
  status = { ...status, ...next };
  for (const listener of statusListeners) listener();
}

/** Dispatches a server event to every `useRealtimeEvent` subscriber; exported for tests. */
export function dispatchRealtimeEvent(event: string, payload: unknown): void {
  setStatus({ lastMessageAt: new Date() });
  for (const handler of handlers.get(event) ?? []) handler(payload);
}

/** Subscribes to one server event on the shared admin socket for the lifetime of the component. */
export function useRealtimeEvent(event: RealtimeServerEvent, handler: Handler): void {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    const wrapped: Handler = (payload) => latest.current(payload);
    const set = handlers.get(event) ?? new Set<Handler>();
    set.add(wrapped);
    handlers.set(event, set);
    return () => {
      set.delete(wrapped);
    };
  }, [event]);
}

/** Connection state, last message time and reconnect count of the shared admin socket. */
export function useRealtimeStatus(): RealtimeStatus {
  return useSyncExternalStore(
    (listener) => {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    () => status,
    // The server render has no socket; hydration must start from the same initial status.
    () => INITIAL_STATUS,
  );
}

export function queryKeysFor(entityType: EntityType): string[] {
  return [entityType, ...(ENTITY_QUERY_KEYS[entityType] ?? [])];
}

/** One socket per admin tab; `entity:changed` invalidates list and detail queries (A§14.2). */
export function useRealtime(enabled: boolean): RealtimeState {
  const client = useQueryClient();
  const [state, setState] = useState<RealtimeState>("connecting");

  useEffect(() => {
    setStatus({ state });
  }, [state]);

  useEffect(() => {
    if (!enabled) return undefined;
    let socket: Socket | null = null;
    let cancelled = false;
    const token = async () => (await api<{ token: string }>("/auth/socket-token", { method: "POST" })).token;

    void (async () => {
      try {
        const first = await token();
        if (cancelled) return;
        socket = io(clientRealtimeUrl(), { auth: (cb) => void (cb({ token: first })), transports: ["websocket"] });
        socket.on("connect", () => setState("connected"));
        socket.on("disconnect", () => setState("reconnecting"));
        socket.io.on("reconnect_attempt", () => setState("reconnecting"));
        socket.io.on("reconnect", () => setStatus({ reconnectCount: status.reconnectCount + 1 }));
        socket.onAny((event: string, payload: unknown) => dispatchRealtimeEvent(event, payload));
        socket.on("connect_error", (error) => {
          setState("reconnecting");
          if (error.message === "UNAUTHENTICATED" && socket !== null) {
            void token().then((next) => {
              if (socket !== null) socket.auth = { token: next };
            });
          }
        });
        socket.on(RealtimeServerEvents.entityChanged, (payload: EntityChangedPayload) => {
          for (const key of queryKeysFor(payload.entityType)) void client.invalidateQueries({ queryKey: [key] });
        });
        socket.on(RealtimeServerEvents.notificationNew, () => void client.invalidateQueries({ queryKey: ["notifications"] }));
        socket.on(RealtimeServerEvents.orgStatus, () => void client.invalidateQueries({ queryKey: ["me"] }));
      } catch {
        if (!cancelled) setState("offline");
      }
    })();

    const online = () => setState((s) => (s === "offline" ? "reconnecting" : s));
    const offline = () => setState("offline");
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      socket?.disconnect();
    };
  }, [enabled, client]);

  return state;
}
