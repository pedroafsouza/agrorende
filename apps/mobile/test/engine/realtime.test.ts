import { createRealtimeClient, type RealtimeSocket } from "../../src/realtime/client";

type Listener = (...args: never[]) => void;

function fakeSocket(ackResponse: unknown, ackError: Error | null = null) {
  const listeners = new Map<string, Listener>();
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const socket: RealtimeSocket & { fire(event: string, payload?: unknown): void; emitted: typeof emitted } = {
    connected: false,
    auth: {},
    on: (event, listener) => listeners.set(event, listener),
    off: (event) => listeners.delete(event),
    connect: () => undefined,
    disconnect: () => undefined,
    timeout: () => ({
      emit: (event, payload, ack) => {
        emitted.push({ event, payload });
        ack(ackError, ackResponse);
      },
    }),
    fire(event, payload) {
      if (event === "connect") (socket as { connected: boolean }).connected = true;
      (listeners.get(event) as ((p: unknown) => void) | undefined)?.(payload);
    },
    emitted,
  };
  return socket;
}

describe("realtime client", () => {
  test("pokes kick sync and location batches resolve on ack", async () => {
    const socket = fakeSocket({ ok: true, accepted: 1 });
    const onSyncPoke = jest.fn();
    let authToken: unknown;
    const client = createRealtimeClient({
      url: "http://rt",
      getToken: async () => "tok",
      handlers: { onSyncPoke },
      factory: (_url, options) => {
        options.auth((data) => {
          authToken = data;
        });
        return socket;
      },
    });
    expect(await client.emitLocationBatch([])).toBe(false);
    client.connect();
    socket.fire("connect");
    await Promise.resolve();
    expect(authToken).toEqual({ token: "tok" });
    expect(client.status.getState().status).toBe("connected");
    socket.fire("sync:poke", { reason: "job.assigned" });
    expect(onSyncPoke).toHaveBeenCalledWith("job.assigned");
    const fix = { recordedAt: "2025-01-01T00:00:00.000Z", lat: 1, lng: 2 };
    expect(await client.emitLocationBatch([fix])).toBe(true);
    expect(socket.emitted[0]).toEqual({ event: "location:batch", payload: { fixes: [fix] } });
    client.disconnect();
    expect(client.status.getState().status).toBe("disconnected");
  });

  test("a timed-out or malformed ack keeps the fixes", async () => {
    const socket = fakeSocket(undefined, new Error("timeout"));
    const client = createRealtimeClient({ url: "x", getToken: async () => "t", handlers: { onSyncPoke: () => undefined }, factory: () => socket });
    client.connect();
    socket.fire("connect");
    expect(await client.emitLocationBatch([{ recordedAt: "2025-01-01T00:00:00.000Z", lat: 1, lng: 2 }])).toBe(false);
  });
});
