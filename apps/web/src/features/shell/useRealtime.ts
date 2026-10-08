"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";

import { RealtimeServerEvents, type EntityChangedPayload } from "@agrorende/contracts/realtime";
import type { EntityType } from "@agrorende/contracts/enums";

import { api } from "@/lib/api";

export type RealtimeState = "connecting" | "connected" | "reconnecting" | "offline";

const REALTIME_URL = process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:4001";

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

export function queryKeysFor(entityType: EntityType): string[] {
  return [entityType, ...(ENTITY_QUERY_KEYS[entityType] ?? [])];
}

/** One socket per admin tab; `entity:changed` invalidates list and detail queries (A§14.2). */
export function useRealtime(enabled: boolean): RealtimeState {
  const client = useQueryClient();
  const [state, setState] = useState<RealtimeState>("connecting");

  useEffect(() => {
    if (!enabled) return undefined;
    let socket: Socket | null = null;
    let cancelled = false;
    const token = async () => (await api<{ token: string }>("/auth/socket-token", { method: "POST" })).token;

    void (async () => {
      try {
        const first = await token();
        if (cancelled) return;
        socket = io(REALTIME_URL, { auth: (cb) => void (cb({ token: first })), transports: ["websocket"] });
        socket.on("connect", () => setState("connected"));
        socket.on("disconnect", () => setState("reconnecting"));
        socket.io.on("reconnect_attempt", () => setState("reconnecting"));
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
