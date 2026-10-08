import {
  LocationBatchAckSchema,
  RealtimeClientEvents,
  RealtimeServerEvents,
  type LocationFix,
  type OrgStatusPayload,
} from "@agrorende/contracts/realtime";
import { createStore } from "zustand/vanilla";

/** The subset of a socket.io client socket the app uses; injected so it is testable. */
export interface RealtimeSocket {
  readonly connected: boolean;
  on(event: string, listener: (...args: never[]) => void): unknown;
  off(event: string, listener?: (...args: never[]) => void): unknown;
  connect(): unknown;
  disconnect(): unknown;
  timeout(ms: number): { emit(event: string, payload: unknown, ack: (error: Error | null, response: unknown) => void): unknown };
  auth: { [key: string]: unknown } | ((cb: (data: object) => void) => void);
}

export type SocketFactory = (url: string, options: { auth: (cb: (data: object) => void) => void; reconnectionDelayMax: number }) => RealtimeSocket;

export type RealtimeStatus = "disconnected" | "connecting" | "connected";

export interface RealtimeHandlers {
  readonly onSyncPoke: (reason: string) => void;
  readonly onOrgStatus?: (payload: OrgStatusPayload) => void;
  readonly onNotification?: () => void;
}

export interface RealtimeDeps {
  readonly url: string;
  readonly factory: SocketFactory;
  readonly getToken: () => Promise<string>;
  readonly handlers: RealtimeHandlers;
  readonly ackTimeoutMs?: number;
}

/** Foreground-only socket (ARCHITECTURE §9). Pokes kick the sync engine; location batches wait for an ack. */
export function createRealtimeClient(deps: RealtimeDeps) {
  const status = createStore<{ status: RealtimeStatus }>()(() => ({ status: "disconnected" }));
  let socket: RealtimeSocket | undefined;

  const onConnect = () => status.setState({ status: "connected" });
  const onDisconnect = () => status.setState({ status: "disconnected" });
  const onPoke = (payload: { reason?: unknown } | undefined) => deps.handlers.onSyncPoke(typeof payload?.reason === "string" ? payload.reason : "poke");
  const onOrgStatus = (payload: OrgStatusPayload) => deps.handlers.onOrgStatus?.(payload);
  const onNotification = () => deps.handlers.onNotification?.();

  function connect(): void {
    if (socket !== undefined) {
      if (!socket.connected) socket.connect();
      return;
    }
    status.setState({ status: "connecting" });
    // A fresh short-lived token is fetched for every (re)connect attempt.
    const auth = (cb: (data: object) => void) => {
      deps.getToken().then(
        (token) => cb({ token }),
        () => cb({}),
      );
    };
    socket = deps.factory(deps.url, { auth, reconnectionDelayMax: 30_000 });
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on(RealtimeServerEvents.syncPoke, onPoke as (...args: never[]) => void);
    socket.on(RealtimeServerEvents.orgStatus, onOrgStatus as (...args: never[]) => void);
    socket.on(RealtimeServerEvents.notificationNew, onNotification);
  }

  function disconnect(): void {
    if (socket === undefined) return;
    socket.off("connect", onConnect);
    socket.off("disconnect", onDisconnect);
    socket.off(RealtimeServerEvents.syncPoke);
    socket.off(RealtimeServerEvents.orgStatus);
    socket.off(RealtimeServerEvents.notificationNew);
    socket.disconnect();
    socket = undefined;
    status.setState({ status: "disconnected" });
  }

  /** Resolves true only on a valid ack; the caller keeps the fixes otherwise. */
  function emitLocationBatch(fixes: readonly LocationFix[]): Promise<boolean> {
    const current = socket;
    if (current === undefined || !current.connected) return Promise.resolve(false);
    return new Promise((resolve) => {
      current.timeout(deps.ackTimeoutMs ?? 10_000).emit(RealtimeClientEvents.locationBatch, { fixes }, (error, response) => {
        resolve(error === null && LocationBatchAckSchema.safeParse(response).success);
      });
    });
  }

  return { connect, disconnect, emitLocationBatch, status, isConnected: () => socket?.connected === true };
}

export type RealtimeClient = ReturnType<typeof createRealtimeClient>;
